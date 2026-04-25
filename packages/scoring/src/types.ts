export interface ComponentScores {
  soil: number;
  flood: number;
  price: number;
  acreage: number;
  zoning: number;
  geography: number;
  infrastructure: number;
  climate: number;
}

export interface ScoringWeights {
  soil: number;
  flood: number;
  price: number;
  acreage: number;
  zoning: number;
  geography: number;
  infrastructure: number;
  climate: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  flood: 2.0,
  soil: 1.5,
  price: 1.5,
  acreage: 1.0,
  zoning: 1.0,
  geography: 1.0,
  climate: 0.8,
  infrastructure: 0.5,
};

export interface ScoringResult {
  overallScore: number;
  componentScores: ComponentScores;
  hardFilterFailed: boolean;
  failedFilters: string[];
}

import type { SearchCriteria } from '@landmatch/api';

export type { SearchCriteria };

export interface ListingData {
  price?: number;
  acreage?: number;
  latitude?: number;
  longitude?: number;
}

export interface EnrichmentData {
  soilCapabilityClass?: number;
  soilDrainageClass?: string;
  soilTexture?: string;
  floodZone?: string;
  zoningCode?: string;
  infrastructure?: string[];
  fireRiskScore?: number;
  floodRiskScore?: number;
  // Climate normals (PRISM)
  frostFreeDays?: number;
  annualPrecipIn?: number;
  avgMinTempF?: number;
  avgMaxTempF?: number;
  growingSeasonDays?: number;
  // Elevation (3DEP)
  elevationFt?: number;
  slopePct?: number;
  // Wetlands (NWI)
  wetlandType?: string | null;
  wetlandDistanceFt?: number;
}
