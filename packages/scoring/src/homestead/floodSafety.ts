import type { EnrichmentData } from '../types';
import type { HomesteadComponentScore } from './types';

const ZONE_SCORES: Record<string, number> = {
  X: 100, B: 80, C: 80, D: 60, A: 20, AE: 15, AH: 15, AO: 15, AR: 25, VE: 0, V: 0,
};

export function scoreFloodSafety(enrichment: EnrichmentData): HomesteadComponentScore {
  const zone = enrichment.floodZone;
  const elevation = enrichment.elevationFt;
  const slope = enrichment.slopePct;

  if (!zone && elevation === undefined) {
    return { score: 50, label: 'Unknown — no flood or elevation data' };
  }

  const zoneScore = zone ? (ZONE_SCORES[zone] ?? 50) : 50;

  // Higher elevation = safer from flooding
  let elevationAdjust = 0;
  if (elevation !== undefined) {
    if (elevation > 1000) elevationAdjust = 10;
    else if (elevation > 500) elevationAdjust = 5;
    else if (elevation < 100) elevationAdjust = -10;
  }

  // Some slope means water drains away; flat = pooling risk
  let slopeAdjust = 0;
  if (slope !== undefined) {
    if (slope >= 2 && slope <= 15) slopeAdjust = 5;
    else if (slope < 1) slopeAdjust = -5;
  }

  const score = Math.max(0, Math.min(100, zoneScore + elevationAdjust + slopeAdjust));

  const parts: string[] = [];
  if (zone) parts.push(`Zone ${zone}`);
  if (elevation !== undefined) parts.push(`${Math.round(elevation)}ft elevation`);
  if (slope !== undefined) parts.push(`${slope}% slope`);

  const detail = parts.join(', ');
  let quality: string;
  if (score >= 80) quality = 'excellent flood safety';
  else if (score >= 60) quality = 'moderate flood risk';
  else if (score >= 30) quality = 'elevated flood risk';
  else quality = 'high flood risk';

  return { score, label: `${detail} — ${quality}` };
}
