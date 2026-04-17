import { scoreAcreage, scoreClimate, scoreFlood, scoreGeography, scoreInfrastructure, scorePrice, scoreSoil, scoreZoning } from './components';
import type { ComponentScores, EnrichmentData, ListingData, ScoringResult, SearchCriteria, ScoringWeights } from './types';
import { DEFAULT_WEIGHTS } from './types';

export function scoreListing(listing: ListingData, enrichment: EnrichmentData, criteria: SearchCriteria): ScoringResult {
  // Check hard filters first
  const failedFilters: string[] = [];

  if (criteria.floodZoneExclude && enrichment.floodZone && criteria.floodZoneExclude.includes(enrichment.floodZone)) {
    failedFilters.push('flood_zone_excluded');
  }
  if (criteria.price?.max && listing.price && listing.price > criteria.price.max * 1.5) {
    failedFilters.push('price_over_hard_limit');
  }
  if (criteria.geography?.type === 'radius' && criteria.geography.center && criteria.geography.radiusMiles) {
    const geoScore = scoreGeography(listing.latitude, listing.longitude, criteria.geography);
    if (geoScore === 0) failedFilters.push('outside_geography');
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
    geography: scoreGeography(listing.latitude, listing.longitude, criteria.geography),
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
    totalWeight += weight;
    totalScore += scores[key] * weight;
  }

  return totalWeight === 0 ? 0 : Math.round(totalScore / totalWeight);
}

function emptyScores(): ComponentScores {
  return { soil: 0, flood: 0, price: 0, acreage: 0, zoning: 0, geography: 0, infrastructure: 0, climate: 0 };
}
