import { err, ok, type Result, type EnrichListingRequest, type EnrichListingResponse } from '@landmatch/api';
import { enrichListing } from '@landmatch/enrichment';

import { db } from '../db/client';
import * as listingRepo from '../repos/listingRepo';

type ListingRow = NonNullable<Awaited<ReturnType<typeof listingRepo.findListingById>>>;
type EnrichmentRow = NonNullable<Awaited<ReturnType<typeof listingRepo.findByUrl>>>['enrichment'];

function toEnrichListingResponse(
  listing: ListingRow,
  enrichment: EnrichmentRow,
  errors: Array<{ source: string; error: string }> = [],
): EnrichListingResponse {
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

    // 3. Build response
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
