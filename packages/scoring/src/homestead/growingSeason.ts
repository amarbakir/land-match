import type { EnrichmentData } from '../types';
import type { HomesteadComponentScore } from './types';

function hardinessZone(avgMinTempF: number): string {
  if (avgMinTempF <= -50) return '1';
  if (avgMinTempF <= -40) return '2';
  if (avgMinTempF <= -30) return '3';
  if (avgMinTempF <= -20) return '4';
  if (avgMinTempF <= -10) return '5';
  if (avgMinTempF <= 0) return '6a';
  if (avgMinTempF <= 10) return '6b';
  if (avgMinTempF <= 20) return '7a';
  if (avgMinTempF <= 30) return '7b';
  if (avgMinTempF <= 40) return '8';
  return '9+';
}

export function scoreGrowingSeason(enrichment: EnrichmentData): HomesteadComponentScore {
  const ffd = enrichment.frostFreeDays;
  const minTemp = enrichment.avgMinTempF;

  if (ffd === undefined) {
    return { score: 50, label: 'Unknown — no growing season data available' };
  }

  // Frost-free days: 200+ = 100, 60 = 0, linear
  const ffdScore = Math.max(0, Math.min(100, Math.round(((ffd - 60) / 140) * 100)));

  // Minor temp adjustment for extreme winters
  let tempAdjust = 0;
  if (minTemp !== undefined) {
    if (minTemp < 0) tempAdjust = -10;
    else if (minTemp > 30) tempAdjust = 10;
  }

  const score = Math.max(0, Math.min(100, ffdScore + tempAdjust));
  const zone = minTemp !== undefined ? `, zone ${hardinessZone(minTemp)}` : '';

  let quality: string;
  if (score >= 80) quality = 'excellent growing season';
  else if (score >= 60) quality = 'good growing season';
  else if (score >= 40) quality = 'moderate growing season, focus on cold-hardy crops';
  else if (score >= 20) quality = 'short growing season, season extension recommended';
  else quality = 'very short growing season';

  return { score, label: `${ffd} frost-free days${zone} — ${quality}` };
}
