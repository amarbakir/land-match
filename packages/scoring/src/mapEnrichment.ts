import type { EnrichmentResult } from '@landmatch/enrichment';
import type { EnrichmentData, EnrichmentRow } from './types';

export function mapEnrichmentRow(row: EnrichmentRow | null | undefined): EnrichmentData {
  if (!row) return {};
  return {
    soilCapabilityClass: row.soilCapabilityClass ?? undefined,
    soilDrainageClass: row.soilDrainageClass ?? undefined,
    soilTexture: row.soilTexture ?? undefined,
    floodZone: row.femaFloodZone ?? undefined,
    zoningCode: row.zoningCode ?? undefined,
    fireRiskScore: row.fireRiskScore ?? undefined,
    floodRiskScore: row.floodRiskScore ?? undefined,
    frostFreeDays: row.frostFreeDays ?? undefined,
    annualPrecipIn: row.annualPrecipIn ?? undefined,
    avgMinTempF: row.avgMinTempF ?? undefined,
    avgMaxTempF: row.avgMaxTempF ?? undefined,
    growingSeasonDays: row.growingSeasonDays ?? undefined,
    elevationFt: row.elevationFt ?? undefined,
    slopePct: row.slopePct ?? undefined,
    wetlandType: row.wetlandType,
    wetlandDistanceFt: row.wetlandWithinBufferFt ?? undefined,
  };
}

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
