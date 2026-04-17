import type { Result } from '@landmatch/config';

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
