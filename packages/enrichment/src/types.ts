import type { EnrichmentResult, Result } from '@landmatch/api';

// The enrichment data contracts live in @landmatch/api so pure consumers (e.g.
// @landmatch/scoring) can use the shapes without depending on this package's
// runtime deps. Re-exported here so existing @landmatch/enrichment importers are
// unaffected.
export type {
  ClimateData,
  ClimateNormalsData,
  ElevationData,
  EnrichmentResult,
  FloodData,
  ParcelData,
  Result,
  SoilData,
  WetlandsData,
} from '@landmatch/api';

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
