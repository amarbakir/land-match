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

export interface SearchCriteria {
  acreage?: { min?: number; max?: number };
  price?: { min?: number; max?: number };
  soilCapabilityClass?: { max: number };
  floodZoneExclude?: string[];
  geography?: {
    type: 'radius' | 'counties' | 'driveTime';
    center?: { lat: number; lng: number };
    radiusMiles?: number;
  };
  zoning?: string[];
  infrastructure?: string[];
  climateRisk?: { maxFireRisk?: number; maxFloodRisk?: number };
  weights?: Partial<ScoringWeights>;
}

export interface ListingData {
  price?: number;
  acreage?: number;
  latitude?: number;
  longitude?: number;
}

export interface EnrichmentData {
  soilCapabilityClass?: number;
  floodZone?: string;
  zoningCode?: string;
  infrastructure?: string[];
  fireRiskScore?: number;
  floodRiskScore?: number;
}
