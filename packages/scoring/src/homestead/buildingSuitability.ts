import type { EnrichmentData } from '../types';
import type { HomesteadComponentScore } from './types';

const HIGH_RISK_FLOOD_ZONES = new Set(['A', 'AE', 'AH', 'AO', 'V', 'VE']);

export function scoreBuildingSuitability(enrichment: EnrichmentData): HomesteadComponentScore {
  const slope = enrichment.slopePct;
  const elevation = enrichment.elevationFt;
  const floodZone = enrichment.floodZone;

  if (slope === undefined && elevation === undefined && !floodZone) {
    return { score: 50, label: 'Unknown — no terrain data available' };
  }

  // Slope: 0-8% ideal, 8-15% moderate, 15-25% difficult, 25%+ very difficult
  let slopeScore = 50;
  if (slope !== undefined) {
    if (slope <= 8) slopeScore = 100;
    else if (slope <= 15) slopeScore = 70;
    else if (slope <= 25) slopeScore = 40;
    else slopeScore = 15;
  }

  // Flood zone penalty
  let floodPenalty = 0;
  if (floodZone) {
    if (HIGH_RISK_FLOOD_ZONES.has(floodZone)) floodPenalty = -40;
    else if (floodZone === 'D') floodPenalty = -15;
  }

  // Very low elevation is risky for building
  let elevAdjust = 0;
  if (elevation !== undefined) {
    if (elevation < 50) elevAdjust = -15;
    else if (elevation < 200) elevAdjust = -5;
  }

  const score = Math.max(0, Math.min(100, slopeScore + floodPenalty + elevAdjust));

  const parts: string[] = [];
  if (slope !== undefined) {
    parts.push(slope <= 8 ? 'gentle slope' : slope <= 15 ? 'moderate slope' : 'steep slope');
  }
  if (floodZone) parts.push(`Zone ${floodZone}`);

  let quality: string;
  if (score >= 80) quality = 'excellent building site';
  else if (score >= 60) quality = 'suitable for building';
  else if (score >= 40) quality = 'challenging build site';
  else quality = 'difficult to build on';

  return { score, label: `${parts.join(', ')} — ${quality}` };
}
