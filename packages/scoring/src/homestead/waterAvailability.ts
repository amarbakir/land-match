import type { EnrichmentData } from '../types';
import type { HomesteadComponentScore } from './types';

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

  // Drainage adjustment: moderate drainage is ideal for homesteading
  let drainageAdjust = 0;
  if (drainage) {
    if (drainage.includes('Moderately well')) drainageAdjust = 10;
    else if (drainage === 'Well drained') drainageAdjust = 5;
    else if (drainage.includes('Poorly')) drainageAdjust = -5;
    else if (drainage.includes('Excessively')) drainageAdjust = -10;
  }

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
