import { err, isHttpUrl, ok, type Result, type EnrichListingRequest, type EnrichListingResponse, type ListingEnrichmentStatus, type PaginatedSavedListings, type SavedListingsFilters } from '@landmatch/api';
import { deriveEnrichmentStatus, enrichListing, type EnrichmentResult, type EnrichmentStatus } from '@landmatch/enrichment';
import { homesteadScore, mapEnrichmentRow, mapListingRow, type ListingRow, type EnrichmentRow } from '@landmatch/scoring';

import { captureError } from '../lib/captureError';
import { isForeignKeyViolation } from '../lib/pgErrors';
import { db, type Tx } from '../db/client';
import * as listingRepo from '../repos/listingRepo';
import { matchListingAgainstProfiles } from './matchingService';

type DbListingRow = NonNullable<Awaited<ReturnType<typeof listingRepo.findListingById>>>;
type DbEnrichmentRow = NonNullable<Awaited<ReturnType<typeof listingRepo.findByUrl>>>['enrichment'];
type SavedListingRow = Awaited<ReturnType<typeof listingRepo.findSavedListings>>['rows'][number];
// Minimal listing shape scoring/persistence needs — full rows satisfy it, and
// callers holding a projection (re-enrichment candidates) don't over-fetch.
type ScorableListing = Pick<DbListingRow, 'id' | 'price' | 'acreage' | 'latitude' | 'longitude'>;

export function computeHomestead(listing: ScorableListing, enrichment: DbEnrichmentRow) {
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

// Shared tail of every enrichment write path (fresh insert, re-enrichment
// merge, dedupe copy): compute and persist the homestead score for a row that
// was just written, so no path leaves homestead_score unset. Returns the row
// and the score so callers can reuse them without recomputing.
async function scoreEnrichmentRow(listing: ScorableListing, enrichmentRow: DbEnrichmentRow, tx?: Tx) {
  const hs = computeHomestead(listing, enrichmentRow);
  await listingRepo.updateHomesteadScore(listing.id, hs.homesteadScore, tx);
  return { enrichmentRow, hs };
}

// Single write path for pipeline-produced enrichment (interactive enrich +
// re-enrichment); the dedupe copy path shares the scoring tail via
// scoreEnrichmentRow.
export async function persistEnrichment(
  listing: ScorableListing,
  enrichment: EnrichmentResult,
  tx?: Tx,
) {
  const enrichmentRow = await listingRepo.insertEnrichment(listing.id, enrichment, tx);
  return scoreEnrichmentRow(listing, enrichmentRow, tx);
}

// Fire-and-forget: scoring/alerting must never block the enrich response.
function startBackgroundMatching(listingId: string, opts?: { rescore?: boolean }) {
  const matching = opts
    ? matchListingAgainstProfiles(listingId, opts)
    : matchListingAgainstProfiles(listingId);
  matching.catch((e) => captureError(e, 'listingService: background matching failed'));
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
      // TEXT column, but every write path goes through the enum
      enrichmentStatus: listing.enrichmentStatus as ListingEnrichmentStatus,
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

// Loose address equality for the recycled-URL guard: same property extracted
// twice yields the same string modulo case/punctuation; a different property
// at a reused URL does not.
function sameAddress(a: string, b: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return norm(a) === norm(b);
}

// After losing the (user_id, url) insert race: the winner has committed (the
// conflicting insert blocks until it does) and is our own row, so findByUrl
// always sees it. A conflict with no visible winner should be impossible —
// surface it loudly rather than retrying the vendor fan-out. When the loser
// already paid for a vendor fan-out, its result is merged onto the winner's
// row (insertEnrichment coalesces) instead of being discarded — the winner's
// run may have been the partial one.
async function raceLoserResponse(
  url: string,
  userId: string,
  enrichment?: EnrichmentResult,
): Promise<Result<EnrichListingResponse>> {
  const winner = await listingRepo.findByUrl(url, userId);
  if (!winner) {
    captureError(
      new Error(`(user_id, url) conflict but no visible winner for ${url}`),
      'listingService.raceLoserResponse',
    );
    return err('INTERNAL_ERROR');
  }
  if (!enrichment) return ok(toEnrichListingResponse(winner.listing, winner.enrichment));

  const { enrichmentRow, hs } = await persistEnrichment(winner.listing, enrichment);
  return ok(toEnrichListingResponse(winner.listing, enrichmentRow, enrichment.errors, hs));
}

// Outcome of the URL dedupe check (land-match-0jx.10 / ckt):
// serve — an existing row answers the request, no vendor work.
// heal  — the caller's own dead-end row must be re-enriched IN PLACE: the
//         (user_id, url) unique index forbids forking a second row.
// fresh — nothing reusable, run the pipeline into a new row.
type UrlReuseOutcome =
  | { kind: 'serve'; response: Result<EnrichListingResponse> }
  | { kind: 'heal'; listing: DbListingRow }
  | { kind: 'fresh' };

async function reuseExistingByUrl(
  input: EnrichListingRequest & { url: string },
  userId: string,
): Promise<UrlReuseOutcome> {
  // The caller's own or a feed row for this URL is returned as-is — no vendor
  // calls, no new row, no re-scoring (repeats multiplied alert emails). The
  // re-enrichment cron owns healing incomplete rows. Exception: a row the
  // cron can never heal (no enrichment data AND outside the healing loop's
  // filters) must not permanently block the pipeline for this URL — the
  // caller's own dead row is revived in place, a dead feed row is forked.
  const visible = await listingRepo.findByUrl(input.url, userId);
  if (visible) {
    const l = visible.listing;
    const healable =
      l.enrichmentAttempts < listingRepo.MAX_ENRICHMENT_ATTEMPTS &&
      l.latitude != null &&
      l.longitude != null;
    if (visible.enrichment || healable) {
      return { kind: 'serve', response: ok(toEnrichListingResponse(l, visible.enrichment)) };
    }
    if (l.userId === userId) return { kind: 'heal', listing: l };
  }

  // Another user already enriched this URL — invisible to the caller's by-url
  // pre-check, so the request fell through to here. Copy the vendor-derived
  // enrichment (not user-private) into a fresh caller-owned row instead of
  // re-burning geocode + vendor quota. The caller's request fields win; the
  // geocode rides along from the source row. Address must match: listing
  // sites recycle URLs, and copying would pin the OLD property's coordinates
  // and soil/flood data onto the caller's listing.
  const source = await listingRepo.findEnrichmentSourceByUrl(input.url);
  if (
    !source ||
    source.latitude == null ||
    source.longitude == null || // a coordinate-less copy could never be healed
    source.address == null ||
    !sameAddress(source.address, input.address)
  ) {
    return { kind: 'fresh' }; // nothing reusable — run the full pipeline
  }

  const persisted = await db.transaction(async (tx) => {
    const listing = await listingRepo.insertListing(
      {
        address: input.address,
        latitude: source.latitude!,
        longitude: source.longitude!,
        price: input.price,
        acreage: input.acreage,
        url: input.url,
        title: input.title,
        source: input.source,
        externalId: input.externalId,
        userId,
        // Completeness travels with the copied data, keeping the copy in the
        // re-enrichment loop when the source was partial.
        enrichmentStatus: source.enrichmentStatus as EnrichmentStatus,
      },
      tx,
    );
    if (!listing) return null; // lost the (user_id, url) race
    const enrichmentRow = await listingRepo.insertEnrichmentCopy(listing.id, source.enrichment, tx);
    const scored = await scoreEnrichmentRow(listing, enrichmentRow, tx);
    return { listing, ...scored };
  });

  if (!persisted) return { kind: 'serve', response: await raceLoserResponse(input.url, userId) };

  startBackgroundMatching(persisted.listing.id);

  return {
    kind: 'serve',
    response: ok(toEnrichListingResponse(persisted.listing, persisted.enrichmentRow, [], persisted.hs)),
  };
}

export async function enrichAndPersist(
  input: EnrichListingRequest,
  userId: string,
): Promise<Result<EnrichListingResponse>> {
  try {
    // 0. Repeat of a known URL? Reuse instead of duplicating (0jx.10).
    let healTarget: DbListingRow | null = null;
    if (input.url) {
      const reuse = await reuseExistingByUrl({ ...input, url: input.url }, userId);
      if (reuse.kind === 'serve') return reuse.response;
      if (reuse.kind === 'heal') healTarget = reuse.listing;
    }

    // 1. Geocode + enrich via pipeline
    const enrichResult = await enrichListing(input.address);

    if (!enrichResult.ok) {
      return err(enrichResult.error);
    }

    const { geocode, enrichment } = enrichResult.data;

    // 2. Persist listing + enrichment in a transaction. The listing write is
    // deliberately the FIRST statement: returning null (lost race / vanished
    // heal target) commits an empty transaction, which is only safe while
    // nothing precedes it.
    const persisted = await db.transaction(async (tx) => {
      const listing = healTarget
        ? await listingRepo.reviveListing(
            healTarget.id,
            {
              latitude: geocode.lat,
              longitude: geocode.lng,
              price: input.price,
              acreage: input.acreage,
              title: input.title,
              enrichmentStatus: deriveEnrichmentStatus(enrichment),
            },
            tx,
          )
        : await listingRepo.insertListing(
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
      if (!listing) return null; // lost the (user_id, url) race mid-fan-out

      const { enrichmentRow, hs } = await persistEnrichment(listing, enrichment, tx);

      return { listing, enrichmentRow, hs };
    });

    if (!persisted) {
      if (!input.url) {
        // A conflict is only possible with a URL (the index predicate requires one).
        captureError(new Error('listing insert conflict without a URL'), 'listingService.enrichAndPersist');
        return err('INTERNAL_ERROR');
      }
      // Salvage the paid-for fan-out by merging it onto the winner's row.
      return raceLoserResponse(input.url, userId, enrichment);
    }

    // 3. Score against active search profiles. A revived row may carry stale
    // scores from its dead era — refresh them instead of skipping.
    startBackgroundMatching(persisted.listing.id, healTarget ? { rescore: true } : undefined);

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

    // sort=homestead is ordered in SQL (persisted homestead_score) — a page
    // re-sort here would only shuffle within pages, not across them.

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
    // Same visibility policy as by-url: another user's listing must look like
    // a missing one, or any authenticated user could save an id they learned
    // elsewhere and read its full row + enrichment via GET /saved.
    const listing = await listingRepo.findVisibleListing(listingId, userId);
    if (!listing) return err('NOT_FOUND');

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
