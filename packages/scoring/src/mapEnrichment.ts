import type { EnrichmentResult } from '@landmatch/enrichment';
import type { EnrichmentData } from './types';

export function mapEnrichmentResult(result: EnrichmentResult): EnrichmentData {
  return {
    soilCapabilityClass: result.soil?.capabilityClass,
    floodZone: result.flood?.zone,
    zoningCode: result.parcel?.zoningCode,
    fireRiskScore: result.climate?.fireRiskScore,
    floodRiskScore: result.climate?.floodRiskScore,
  };
}
