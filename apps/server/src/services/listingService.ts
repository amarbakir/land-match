import { err, ok, type Result, type EnrichListingRequest, type EnrichListingResponse, type PaginatedSavedListings, type SavedListingsFilters } from '@landmatch/api';
import { enrichListing } from '@landmatch/enrichment';
import { homesteadScore, mapEnrichmentRow, mapListingRow, type ListingRow, type EnrichmentRow } from '@landmatch/scoring';

import { db } from '../db/client';
import * as listingRepo from '../repos/listingRepo';
import { matchListingAgainstProfiles } from './matchingService';

type DbListingRow = NonNullable<Awaited<ReturnType<typeof listingRepo.findListingById>>>;
type DbEnrichmentRow = NonNullable<Awaited<ReturnType<typeof listingRepo.findByUrl>>>['enrichment'];

function computeHomestead(listing: DbListingRow, enrichment: DbEnrichmentRow) {
  try {
    const result = homesteadScore(mapListingRow(listing), mapEnrichmentRow(enrichment), {});
    const components: Record<string, { score: number; label: string }> = {};
    for (const [key, value] of Object.entries(result.homestead)) {
      components[key] = { score: value.score, label: value.label };
    }
    return { homesteadScore: result.homesteadScore, homesteadComponents: components };
  } catch {
    return { homesteadScore: null, homesteadComponents: null };
  }
}

function toEnrichListingResponse(
  listing: DbListingRow,
  enrichment: DbEnrichmentRow,
  errors: Array<{ source: string; error: string }> = [],
): EnrichListingResponse {
  const hs = computeHomestead(listing, enrichment);
  return {
    listing: {
      id: listing.id,
      address: listing.address ?? '',
      latitude: listing.latitude ?? 0,
      longitude: listing.longitude ?? 0,
      price: listing.price,
      acreage: listing.acreage,
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
      sourcesUsed: enrichment?.sourcesUsed ?? [],
      errors,
    },
    ...hs,
  };
}

export async function enrichAndPersist(
  input: EnrichListingRequest,
  userId?: string,
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
        },
        tx,
      );

      const enrichmentRow = await listingRepo.insertEnrichment(
        listing.id,
        enrichment,
        tx,
      );

      return { listing, enrichmentRow };
    });

    // 3. Score against active search profiles (fire-and-forget)
    matchListingAgainstProfiles(persisted.listing.id).catch((e) =>
      console.error('[listingService] background matching failed:', e),
    );

    // 4. Build response
    return ok(toEnrichListingResponse(persisted.listing, persisted.enrichmentRow, enrichment.errors));
  } catch (error) {
    console.error('[listingService.enrichAndPersist] Unexpected error:', error);
    return err('INTERNAL_ERROR');
  }
}

export async function getByUrl(url: string): Promise<Result<EnrichListingResponse>> {
  const result = await listingRepo.findByUrl(url);
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

    const items = rows.map((row) => {
      let hsScore: number | null = null;
      try {
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
        const result = homesteadScore(mapListingRow(listingRow), mapEnrichmentRow(enrichmentRow), {});
        hsScore = result.homesteadScore;
      } catch { /* scoring failure is non-fatal */ }

      return {
        id: row.id,
        savedAt: row.savedAt.toISOString(),
        listingId: row.listingId,
        title: row.title,
        address: row.address ?? '',
        price: row.price,
        acreage: row.acreage,
        source: row.source,
        url: row.url,
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
    console.error('[listingService.getSavedListings]', error);
    return err('INTERNAL_ERROR');
  }
}

export async function unsaveListing(userId: string, listingId: string): Promise<Result<void>> {
  try {
    const deleted = await listingRepo.unsaveListing(userId, listingId);
    if (!deleted) return err('NOT_FOUND');
    return ok(undefined);
  } catch (error) {
    console.error('[listingService.unsaveListing]', error);
    return err('INTERNAL_ERROR');
  }
}
