import { err, ok, type Result } from '@landmatch/api';
import { scoreListing } from '@landmatch/scoring';
import type { EnrichmentData, ListingData, SearchCriteria } from '@landmatch/scoring';

import * as listingRepo from '../repos/listingRepo';
import * as searchProfileRepo from '../repos/searchProfileRepo';
import * as scoreRepo from '../repos/scoreRepo';
import * as alertRepo from '../repos/alertRepo';

interface MatchResult {
  scored: number;
  alertsCreated: number;
}

function mapToListingData(listing: { price: number | null; acreage: number | null; latitude: number | null; longitude: number | null }): ListingData {
  return {
    price: listing.price ?? undefined,
    acreage: listing.acreage ?? undefined,
    latitude: listing.latitude ?? undefined,
    longitude: listing.longitude ?? undefined,
  };
}

function mapToEnrichmentData(enrichment: {
  soilCapabilityClass: number | null;
  femaFloodZone: string | null;
  zoningCode: string | null;
  fireRiskScore: number | null;
  floodRiskScore: number | null;
}): EnrichmentData {
  return {
    soilCapabilityClass: enrichment.soilCapabilityClass ?? undefined,
    floodZone: enrichment.femaFloodZone ?? undefined,
    zoningCode: enrichment.zoningCode ?? undefined,
    fireRiskScore: enrichment.fireRiskScore ?? undefined,
    floodRiskScore: enrichment.floodRiskScore ?? undefined,
  };
}

export async function matchListingAgainstProfiles(listingId: string): Promise<Result<MatchResult>> {
  try {
    const data = await listingRepo.findListingWithEnrichment(listingId);
    if (!data) return err('Listing not found');
    if (!data.enrichment) return err('Listing not enriched');

    const profiles = await searchProfileRepo.findActive();
    const listingData = mapToListingData(data.listing);
    const enrichmentData = mapToEnrichmentData(data.enrichment);

    let scored = 0;
    let alertsCreated = 0;

    for (const profile of profiles) {
      const existingScore = await scoreRepo.findByListingAndProfile(listingId, profile.id);
      if (existingScore) continue;

      const criteria = profile.criteria as SearchCriteria;
      const result = scoreListing(listingData, enrichmentData, criteria);

      const scoreRow = await scoreRepo.insert({
        listingId,
        searchProfileId: profile.id,
        overallScore: result.overallScore,
        componentScores: result.componentScores as unknown as Record<string, number>,
      });
      scored++;

      if (result.overallScore >= profile.alertThreshold) {
        const existingAlert = await alertRepo.findByListingAndProfile(listingId, profile.id);
        if (!existingAlert) {
          await alertRepo.insert({
            userId: profile.userId,
            searchProfileId: profile.id,
            listingId,
            scoreId: scoreRow.id,
            channel: 'email',
          });
          alertsCreated++;
        }
      }
    }

    return ok({ scored, alertsCreated });
  } catch (error) {
    console.error('[matchingService.matchListingAgainstProfiles]', error);
    return err('INTERNAL_ERROR');
  }
}
