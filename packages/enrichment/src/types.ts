import type { Result } from '@landmatch/api';

export type { Result };

export interface LatLng {
  lat: number;
  lng: number;
}

export type EnrichmentKey = keyof Omit<EnrichmentResult, 'sourcesUsed' | 'errors'>;

export interface EnrichmentAdapter<T> {
  name: string;
  enrich(coords: LatLng): Promise<Result<T>>;
  isAvailable(): boolean;
}

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
