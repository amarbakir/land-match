import type { EnrichmentResult } from '@landmatch/enrichment';
import type { EnrichmentData } from './types';

export function mapEnrichmentResult(result: EnrichmentResult): EnrichmentData {
  return {
    soilCapabilityClass: result.soil?.capabilityClass,
    soilDrainageClass: result.soil?.drainageClass,
    soilTexture: result.soil?.texture,
    floodZone: result.flood?.zone,
    zoningCode: result.parcel?.zoningCode,
    fireRiskScore: result.climate?.fireRiskScore,
    floodRiskScore: result.climate?.floodRiskScore,
    // Climate normals
    frostFreeDays: result.climateNormals?.frostFreeDays,
    annualPrecipIn: result.climateNormals?.annualPrecipIn,
    avgMinTempF: result.climateNormals?.avgMinTempF,
    avgMaxTempF: result.climateNormals?.avgMaxTempF,
    growingSeasonDays: result.climateNormals?.growingSeasonDays,
    // Elevation
    elevationFt: result.elevation?.elevationFt,
    slopePct: result.elevation?.slopePct,
    // Wetlands
    wetlandType: result.wetlands?.wetlandType,
    wetlandDistanceFt: result.wetlands?.distanceFt,
  };
}
