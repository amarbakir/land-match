import type { EnrichmentData, ListingData } from '../types';
import type { HomesteadComponentScore } from './types';

export function scoreFirewoodPotential(enrichment: EnrichmentData, listing: ListingData): HomesteadComponentScore {
  const precip = enrichment.annualPrecipIn;
  const maxTemp = enrichment.avgMaxTempF;
  const acreage = listing.acreage;

  if (precip === undefined) {
    return { score: 50, label: 'Unknown — no climate data for firewood assessment' };
  }

  // Linear scale: 15in = 0, 50in = 100 (hardwood needs 30+ for sustainable growth)
  const precipScore = Math.max(0, Math.min(100, Math.round(((precip - 15) / 35) * 100)));

  // Temperature: moderate temps (60-80F max avg) ideal for hardwood
  let tempAdjust = 0;
  if (maxTemp !== undefined) {
    if (maxTemp >= 60 && maxTemp <= 80) tempAdjust = 10;
    else if (maxTemp > 85) tempAdjust = -5;
    else if (maxTemp < 50) tempAdjust = -5;
  }

  // Acreage: need at least 5 acres for sustainable harvest
  let acreageAdjust = 0;
  if (acreage !== undefined) {
    if (acreage >= 20) acreageAdjust = 15;
    else if (acreage >= 10) acreageAdjust = 10;
    else if (acreage >= 5) acreageAdjust = 5;
    else if (acreage < 3) acreageAdjust = -15;
  }

  const score = Math.max(0, Math.min(100, precipScore + tempAdjust + acreageAdjust));

  const acreStr = acreage !== undefined ? `, ${acreage} acres` : '';
  let quality: string;
  if (score >= 70) quality = 'good firewood potential';
  else if (score >= 45) quality = 'moderate firewood potential';
  else quality = 'limited firewood potential';

  return { score, label: `${precip}in precip${acreStr} — ${quality}` };
}
