// Enrichment data contract — the shape of enrichment outputs. This lives in
// @landmatch/api (not @landmatch/enrichment) so pure consumers like
// @landmatch/scoring can depend on the shape without pulling in the enrichment
// package's runtime dependencies (pg, the vendor adapters). @landmatch/enrichment
// re-exports these so its own consumers are unaffected.

export interface EnrichmentResult {
  soil?: SoilData;
  flood?: FloodData;
  parcel?: ParcelData;
  climate?: ClimateData;
  climateNormals?: ClimateNormalsData;
  elevation?: ElevationData;
  wetlands?: WetlandsData;
  sourcesUsed: string[];
  errors: Array<{ source: string; error: string }>;
}

export interface SoilData {
  capabilityClass: number; // I-VIII as 1-8
  drainageClass: string;
  texture: string;
  suitabilityRatings: Record<string, number>;
}

export interface FloodData {
  zone: string; // X, A, AE, VE, etc.
  description: string;
}

export interface ParcelData {
  zoningCode: string;
  zoningDescription: string;
  verifiedAcreage: number;
  geometry: Record<string, unknown>;
}

export interface ClimateData {
  fireRiskScore: number;
  floodRiskScore: number;
  heatRiskScore: number;
  droughtRiskScore: number;
}

export interface ClimateNormalsData {
  frostFreeDays: number;
  annualPrecipIn: number;
  avgMinTempF: number;
  avgMaxTempF: number;
  growingSeasonDays: number;
}

export interface ElevationData {
  elevationFt: number;
  slopePct: number;
}

export interface WetlandsData {
  wetlandType: string | null;
  wetlandDescription: string | null;
  distanceFt: number;
}
