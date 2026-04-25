import type { EnrichmentData } from '../types';
import type { HomesteadComponentScore } from './types';

// Moderate drainage is ideal: retains water without waterlogging
const DRAINAGE_ADJUSTS: Record<string, number> = {
  'Moderately well drained': 10,
  'Well drained': 5,
  'Somewhat excessively drained': -5,
  'Excessively drained': -10,
  'Somewhat poorly drained': -5,
  'Poorly drained': -5,
  'Very poorly drained': -10,
};

export function scoreWaterAvailability(enrichment: EnrichmentData): HomesteadComponentScore {
  const precip = enrichment.annualPrecipIn;
  const drainage = enrichment.soilDrainageClass;
  const wetlandType = enrichment.wetlandType;
  const wetlandDist = enrichment.wetlandDistanceFt;

  if (precip === undefined) {
    return { score: 50, label: 'Unknown — no precipitation data available' };
  }

  // Precip: 50+ inches = 100, 10 inches = 0, linear
  const precipScore = Math.max(0, Math.min(100, Math.round(((precip - 10) / 40) * 100)));

  const drainageAdjust = drainage ? (DRAINAGE_ADJUSTS[drainage] ?? 0) : 0;

  // Wetland proximity bonus: nearby wetlands suggest water availability
  let wetlandBonus = 0;
  if (wetlandType !== null && wetlandType !== undefined && wetlandDist !== undefined && wetlandDist !== Infinity) {
    if (wetlandDist <= 500) wetlandBonus = 15;
    else if (wetlandDist <= 1000) wetlandBonus = 10;
  }

  const score = Math.max(0, Math.min(100, precipScore + drainageAdjust + wetlandBonus));

  const wetlandStr = wetlandType ? ', nearby wetland' : '';
  let quality: string;
  if (score >= 80) quality = 'excellent water availability';
  else if (score >= 60) quality = 'good water availability';
  else if (score >= 40) quality = 'moderate, may need supplemental water';
  else if (score >= 20) quality = 'limited water, irrigation recommended';
  else quality = 'arid, significant water infrastructure needed';

  return { score, label: `${precip}in annual precip${wetlandStr} — ${quality}` };
}
