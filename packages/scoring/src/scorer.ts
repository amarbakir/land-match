import { scoreAcreage, scoreClimate, scoreFlood, scoreGeography, scoreInfrastructure, scorePrice, scoreSoil, scoreZoning } from './components';
import type { ComponentScores, EnrichmentData, ListingData, ScoringResult, SearchCriteria, ScoringWeights } from './types';
import { DEFAULT_WEIGHTS } from './types';

export function scoreListing(listing: ListingData, enrichment: EnrichmentData, criteria: SearchCriteria): ScoringResult {
  // Compute geography score once — used for both hard filter and component score
  const geoScore = scoreGeography(listing.latitude, listing.longitude, criteria.geography);

  // Check hard filters
  const failedFilters: string[] = [];

  if (criteria.floodZoneExclude && criteria.floodZoneExclude.length > 0) {
    if (!enrichment.floodZone) {
      // Zone unknown = adapter failed or FEMA never mapped the parcel. The
      // user drew a hard line on flood risk — an unverified listing must not
      // cross it unless this profile explicitly opted in (land-match-86r);
      // fail closed remains the default (land-match-8zd). Adapter failures
      // heal via re-enrichment + rescoring.
      if (!criteria.includeUnverifiedFloodZone) {
        failedFilters.push('flood_zone_unverified');
      }
    } else if (criteria.floodZoneExclude.includes(enrichment.floodZone)) {
      failedFilters.push('flood_zone_excluded');
    }
  }
  if (criteria.price?.max && listing.price && listing.price > criteria.price.max * 1.5) {
    failedFilters.push('price_over_hard_limit');
  }
  if (geoScore === 0 && criteria.geography?.type === 'radius') {
    failedFilters.push('outside_geography');
  }

  if (failedFilters.length > 0) {
    return {
      overallScore: 0,
      componentScores: emptyScores(),
      hardFilterFailed: true,
      failedFilters,
    };
  }

  const componentScores: ComponentScores = {
    soil: scoreSoil(enrichment.soilCapabilityClass),
    flood: scoreFlood(enrichment.floodZone, criteria.floodZoneExclude ?? []),
    price: scorePrice(listing.price, criteria.price),
    acreage: scoreAcreage(listing.acreage, criteria.acreage),
    zoning: scoreZoning(enrichment.zoningCode, criteria.zoning),
    geography: geoScore,
    infrastructure: scoreInfrastructure(enrichment.infrastructure, criteria.infrastructure),
    climate: scoreClimate(enrichment, criteria.climateRisk),
  };

  const weights: ScoringWeights = { ...DEFAULT_WEIGHTS, ...criteria.weights };
  const overallScore = weightedAverage(componentScores, weights);

  return {
    overallScore,
    componentScores,
    hardFilterFailed: false,
    failedFilters: [],
  };
}

function weightedAverage(scores: ComponentScores, weights: ScoringWeights): number {
  let totalWeight = 0;
  let totalScore = 0;

  for (const key of Object.keys(scores) as Array<keyof ComponentScores>) {
    const weight = weights[key];
    const score = scores[key];
    // Legacy stored criteria may predate weight validation; skip anything unusable
    if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(score)) continue;
    totalWeight += weight;
    totalScore += score * weight;
  }

  if (totalWeight === 0) return 0;
  return Math.min(100, Math.max(0, Math.round(totalScore / totalWeight)));
}

function emptyScores(): ComponentScores {
  return { soil: 0, flood: 0, price: 0, acreage: 0, zoning: 0, geography: 0, infrastructure: 0, climate: 0 };
}
