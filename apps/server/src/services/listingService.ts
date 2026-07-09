import { err, isHttpUrl, ok, type Result, type EnrichListingRequest, type EnrichListingResponse, type PaginatedSavedListings, type SavedListingsFilters } from '@landmatch/api';
import { deriveEnrichmentStatus, enrichListing, type EnrichmentResult } from '@landmatch/enrichment';
import { homesteadScore, mapEnrichmentRow, mapListingRow, type ListingRow, type EnrichmentRow } from '@landmatch/scoring';

import { captureError } from '../lib/captureError';
import { isForeignKeyViolation } from '../lib/pgErrors';
import { db, type Tx } from '../db/client';
import * as listingRepo from '../repos/listingRepo';
import { matchListingAgainstProfiles } from './matchingService';

type DbListingRow = NonNullable<Awaited<ReturnType<typeof listingRepo.findListingById>>>;
type DbEnrichmentRow = NonNullable<Awaited<ReturnType<typeof listingRepo.findByUrl>>>['enrichment'];
type SavedListingRow = Awaited<ReturnType<typeof listingRepo.findSavedListings>>['rows'][number];

export function computeHomestead(listing: DbListingRow, enrichment: DbEnrichmentRow) {
  try {
    const result = homesteadScore(mapListingRow(listing), mapEnrichmentRow(enrichment), {});
    const components: Record<string, { score: number; label: string }> = {};
    for (const [key, value] of Object.entries(result.homestead)) {
      components[key] = { score: value.score, label: value.label };
    }
    return { homesteadScore: result.homesteadScore, homesteadComponents: components };
  } catch (e) {
    captureError(e, 'listingService.computeHomestead');
    return { homesteadScore: null, homesteadComponents: null };
  }
}

// Single write path for enrichment: insert the enrichment row, then compute and
// persist its homestead score. Used by every enrichment producer (interactive
// enrich + feed pipeline) so no path leaves homestead_score unset. Returns the
// inserted row and the computed score so callers can reuse it without recomputing.
export async function persistEnrichment(
  listing: DbListingRow,
  enrichment: EnrichmentResult,
  tx?: Tx,
) {
  const enrichmentRow = await listingRepo.insertEnrichment(listing.id, enrichment, tx);
  const hs = computeHomestead(listing, enrichmentRow);
  await listingRepo.updateHomesteadScore(listing.id, hs.homesteadScore, tx);
  return { enrichmentRow, hs };
}

// Recompute the homestead score from a saved-listings projection row. Used as a
// fallback when the persisted homestead_score column is null (pre-backfill rows).
// May throw if the scoring engine fails; the caller degrades per-row to null and
// reports once per request rather than once per row (a systematic scoring bug
// would otherwise fire one Sentry event per listing and exhaust the error quota).
function scoreFromSavedRow(row: SavedListingRow): number | null {
  const listingRow: ListingRow = {
    price: row.price,
    acreage: row.acreage,
    latitude: row.lat,
    longitude: row.lng,
  };
  const enrichmentRow: EnrichmentRow = {
    soilCapabilityClass: row.soilClass,
    soilDrainageClass: row.soilDrainageClass,
    soilTexture: row.soilTexture,
    femaFloodZone: row.floodZone,
    zoningCode: row.zoning,
    fireRiskScore: row.fireRiskScore,
    floodRiskScore: row.floodRiskScore,
    frostFreeDays: row.frostFreeDays,
    annualPrecipIn: row.annualPrecipIn,
    avgMinTempF: row.avgMinTempF,
    avgMaxTempF: row.avgMaxTempF,
    growingSeasonDays: row.growingSeasonDays,
    elevationFt: row.elevationFt,
    slopePct: row.slopePct,
    wetlandType: row.wetlandType,
    wetlandWithinBufferFt: row.wetlandWithinBufferFt,
  };
  return homesteadScore(mapListingRow(listingRow), mapEnrichmentRow(enrichmentRow), {}).homesteadScore;
}

function toEnrichListingResponse(
  listing: DbListingRow,
  enrichment: DbEnrichmentRow,
  errors: Array<{ source: string; error: string }> = [],
  precomputed?: ReturnType<typeof computeHomestead>,
): EnrichListingResponse {
  const hs = precomputed ?? computeHomestead(listing, enrichment);
  return {
    listing: {
      id: listing.id,
      address: listing.address ?? '',
      latitude: listing.latitude ?? 0,
      longitude: listing.longitude ?? 0,
      price: listing.price,
      acreage: listing.acreage,
      title: listing.title ?? null,
      enrichmentStatus: listing.enrichmentStatus,
    },
    enrichment: {
      soilCapabilityClass: enrichment?.soilCapabilityClass ?? null,
      soilDrainageClass: enrichment?.soilDrainageClass ?? null,
      soilTexture: enrichment?.soilTexture ?? null,
      femaFloodZone: enrichment?.femaFloodZone ?? null,
      zoningCode: enrichment?.zoningCode ?? null,
      fireRiskScore: enrichment?.fireRiskScore ?? null,
      floodRiskScore: enrichment?.floodRiskScore ?? null,
      frostFreeDays: enrichment?.frostFreeDays ?? null,
      growingSeasonDays: enrichment?.growingSeasonDays ?? null,
      elevationFt: enrichment?.elevationFt ?? null,
      slopePct: enrichment?.slopePct ?? null,
      annualPrecipIn: enrichment?.annualPrecipIn ?? null,
      sourcesUsed: enrichment?.sourcesUsed ?? [],
      errors,
    },
    ...hs,
  };
}

export async function enrichAndPersist(
  input: EnrichListingRequest,
  userId: string,
): Promise<Result<EnrichListingResponse>> {
  try {
    // 1. Geocode + enrich via pipeline
    const enrichResult = await enrichListing(input.address);

    if (!enrichResult.ok) {
      return err(enrichResult.error);
    }

    const { geocode, enrichment } = enrichResult.data;

    // 2. Persist listing + enrichment in a transaction
    const persisted = await db.transaction(async (tx) => {
      const listing = await listingRepo.insertListing(
        {
          address: input.address,
          latitude: geocode.lat,
          longitude: geocode.lng,
          price: input.price,
          acreage: input.acreage,
          url: input.url,
          title: input.title,
          source: input.source,
          externalId: input.externalId,
          userId,
          enrichmentStatus: deriveEnrichmentStatus(enrichment),
        },
        tx,
      );

      const { enrichmentRow, hs } = await persistEnrichment(listing, enrichment, tx);

      return { listing, enrichmentRow, hs };
    });

    // 3. Score against active search profiles (fire-and-forget)
    matchListingAgainstProfiles(persisted.listing.id).catch((e) =>
      captureError(e, 'listingService: background matching failed'),
    );

    // 4. Build response (reuse the score computed during persistence)
    return ok(toEnrichListingResponse(persisted.listing, persisted.enrichmentRow, enrichment.errors, persisted.hs));
  } catch (error) {
    captureError(error, 'listingService.enrichAndPersist');
    return err('INTERNAL_ERROR');
  }
}

// Lookups only see ownerless (feed) listings or the caller's own — see
// listingRepo.visibleTo for the policy.
export async function getByUrl(url: string, userId: string): Promise<Result<EnrichListingResponse>> {
  const result = await listingRepo.findByUrl(url, userId);
  if (!result) return err('NOT_FOUND');
  return ok(toEnrichListingResponse(result.listing, result.enrichment));
}

export async function getSavedListings(
  userId: string,
  filters: SavedListingsFilters,
): Promise<Result<PaginatedSavedListings>> {
  try {
    const { rows, total } = await listingRepo.findSavedListings(userId, {
      sort: filters.sort,
      sortDir: filters.sortDir,
      limit: filters.limit,
      offset: filters.offset,
    });

    let recomputeFailures = 0;
    const items = rows.map((row) => {
      // Prefer the persisted score; recompute only for pre-backfill null rows
      // (?? keeps a persisted 0 — a valid hard-filtered score — from recomputing).
      let hsScore = row.homesteadScore;
      if (hsScore == null) {
        try {
          hsScore = scoreFromSavedRow(row);
        } catch {
          recomputeFailures += 1; // degrade this row; report the batch once below
          hsScore = null;
        }
      }

      return {
        id: row.id,
        savedAt: row.savedAt.toISOString(),
        listingId: row.listingId,
        title: row.title,
        address: row.address ?? '',
        price: row.price,
        acreage: row.acreage,
        source: row.source,
        // Same policy as matches: never hand a non-web URL to link renderers.
        url: isHttpUrl(row.url) ? row.url : null,
        lat: row.lat,
        lng: row.lng,
        soilClass: row.soilClass,
        floodZone: row.floodZone,
        zoning: row.zoning,
        homesteadScore: hsScore,
        bestScore: row.bestScoreValue != null
          ? { score: row.bestScoreValue, profileName: row.bestScoreProfileName ?? '' }
          : null,
      };
    });

    if (recomputeFailures > 0) {
      captureError(
        new Error(`homestead recompute failed for ${recomputeFailures}/${rows.length} saved rows`),
        'listingService.getSavedListings.recompute',
      );
    }

    if (filters.sort === 'homestead') {
      items.sort((a, b) => {
        const aScore = a.homesteadScore ?? -1;
        const bScore = b.homesteadScore ?? -1;
        return filters.sortDir === 'desc' ? bScore - aScore : aScore - bScore;
      });
    }

    return ok({
      items,
      total,
      limit: filters.limit ?? 20,
      offset: filters.offset ?? 0,
    });
  } catch (error) {
    captureError(error, 'listingService.getSavedListings');
    return err('INTERNAL_ERROR');
  }
}

export async function saveListing(userId: string, listingId: string): Promise<Result<{ savedAt: string }>> {
  try {
    const saved = await listingRepo.saveListing(userId, listingId);
    // onConflictDoNothing returns nothing if already saved — that's fine
    return ok({ savedAt: (saved?.savedAt ?? new Date()).toISOString() });
  } catch (error) {
    // Unknown listing id trips the FK constraint — that's a client-facing 404,
    // not an internal error (and its raw pg message must never reach clients).
    if (isForeignKeyViolation(error)) return err('NOT_FOUND');
    captureError(error, 'listingService.saveListing');
    return err('INTERNAL_ERROR');
  }
}

export async function unsaveListing(userId: string, listingId: string): Promise<Result<void>> {
  try {
    const deleted = await listingRepo.unsaveListing(userId, listingId);
    if (!deleted) return err('NOT_FOUND');
    return ok(undefined);
  } catch (error) {
    captureError(error, 'listingService.unsaveListing');
    return err('INTERNAL_ERROR');
  }
}
