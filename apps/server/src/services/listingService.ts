import { err, ok, type Result } from '@landmatch/api';
import { enrichListing } from '@landmatch/enrichment';

import { db } from '../db/client';
import * as listingRepo from '../repos/listingRepo';

export interface EnrichInput {
  address: string;
  price?: number;
  acreage?: number;
  url?: string;
  title?: string;
}

export interface EnrichOutput {
  listing: {
    id: string;
    address: string;
    latitude: number;
    longitude: number;
    price: number | null;
    acreage: number | null;
    enrichmentStatus: string;
  };
  enrichment: {
    soilCapabilityClass: number | null;
    soilDrainageClass: string | null;
    soilTexture: string | null;
    femaFloodZone: string | null;
    zoningCode: string | null;
    fireRiskScore: number | null;
    floodRiskScore: number | null;
    sourcesUsed: string[];
    errors: Array<{ source: string; error: string }>;
  };
}

export async function enrichAndPersist(input: EnrichInput): Promise<Result<EnrichOutput>> {
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
        },
        tx,
      );

      const enrichmentRow = await listingRepo.insertEnrichment(
        listing.id,
        enrichment,
        enrichment.sourcesUsed,
        tx,
      );

      return { listing, enrichmentRow };
    });

    // 3. Build response
    return ok({
      listing: {
        id: persisted.listing.id,
        address: persisted.listing.address!,
        latitude: persisted.listing.latitude!,
        longitude: persisted.listing.longitude!,
        price: persisted.listing.price,
        acreage: persisted.listing.acreage,
        enrichmentStatus: persisted.listing.enrichmentStatus,
      },
      enrichment: {
        soilCapabilityClass: persisted.enrichmentRow.soilCapabilityClass,
        soilDrainageClass: persisted.enrichmentRow.soilDrainageClass,
        soilTexture: persisted.enrichmentRow.soilTexture,
        femaFloodZone: persisted.enrichmentRow.femaFloodZone,
        zoningCode: persisted.enrichmentRow.zoningCode,
        fireRiskScore: persisted.enrichmentRow.fireRiskScore,
        floodRiskScore: persisted.enrichmentRow.floodRiskScore,
        sourcesUsed: persisted.enrichmentRow.sourcesUsed ?? [],
        errors: enrichment.errors,
      },
    });
  } catch (error) {
    console.error('[listingService.enrichAndPersist] Unexpected error:', error);
    return err('INTERNAL_ERROR');
  }
}
