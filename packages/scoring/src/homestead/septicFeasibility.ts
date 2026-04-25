import type { EnrichmentData } from '../types';
import type { HomesteadComponentScore } from './types';

const GOOD_SEPTIC_TEXTURES = ['sandy loam', 'loam', 'loamy sand', 'silt loam'];
const MODERATE_SEPTIC_TEXTURES = ['sandy clay loam', 'clay loam', 'silty clay loam'];
const POOR_SEPTIC_TEXTURES = ['clay', 'silty clay', 'sandy clay', 'heavy clay', 'muck', 'peat'];

const DRAINAGE_SCORES: Record<string, number> = {
  'Well drained': 100,
  'Moderately well drained': 80,
  'Somewhat excessively drained': 70,
  'Excessively drained': 50,
  'Somewhat poorly drained': 30,
  'Poorly drained': 10,
  'Very poorly drained': 0,
};

export function scoreSepticFeasibility(enrichment: EnrichmentData): HomesteadComponentScore {
  const texture = enrichment.soilTexture;
  const drainage = enrichment.soilDrainageClass;
  const slope = enrichment.slopePct;
  const wetland = enrichment.wetlandType;
  const wetlandDist = enrichment.wetlandDistanceFt;

  if (!texture && !drainage) {
    return { score: 50, label: 'Unknown — no soil data for septic assessment' };
  }

  // Texture score (40%)
  let textureScore = 50;
  if (texture) {
    const lower = texture.toLowerCase();
    if (GOOD_SEPTIC_TEXTURES.some((t) => lower.includes(t))) textureScore = 95;
    else if (MODERATE_SEPTIC_TEXTURES.some((t) => lower.includes(t))) textureScore = 55;
    else if (POOR_SEPTIC_TEXTURES.some((t) => lower.includes(t))) textureScore = 15;
  }

  // Drainage score (40%)
  const drainageScore = drainage ? (DRAINAGE_SCORES[drainage] ?? 50) : 50;

  // Slope: too flat (pooling) or too steep (runoff)
  let slopeAdjust = 0;
  if (slope !== undefined) {
    if (slope < 1) slopeAdjust = -10;
    else if (slope >= 1 && slope <= 15) slopeAdjust = 5;
    else if (slope > 15 && slope <= 25) slopeAdjust = -10;
    else if (slope > 25) slopeAdjust = -25;
  }

  // Wetland proximity penalty (setback requirements)
  let wetlandPenalty = 0;
  if (wetland !== null && wetland !== undefined && wetlandDist !== undefined && wetlandDist !== Infinity) {
    if (wetlandDist < 100) wetlandPenalty = -30;
    else if (wetlandDist < 300) wetlandPenalty = -15;
  }

  // Texture: 40%, Drainage: 40%, +10 baseline
  const baseScore = Math.round(textureScore * 0.4 + drainageScore * 0.4) + 10;
  const score = Math.max(0, Math.min(100, baseScore + slopeAdjust + wetlandPenalty));

  let quality: string;
  if (score >= 80) quality = 'likely to pass perc test';
  else if (score >= 55) quality = 'moderate — may need engineered system';
  else if (score >= 30) quality = 'challenging — engineered system likely required';
  else quality = 'poor — significant septic challenges';

  const textureStr = texture ?? 'unknown soil';
  return { score, label: `${textureStr} — ${quality}` };
}
