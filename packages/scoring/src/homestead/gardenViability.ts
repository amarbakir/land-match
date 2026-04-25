import type { EnrichmentData } from '../types';
import type { HomesteadComponentScore } from './types';

const SOIL_CLASS_SCORES: Record<number, number> = {
  1: 100, 2: 85, 3: 65, 4: 45, 5: 25, 6: 15, 7: 5, 8: 0,
};

const DRAINAGE_SCORES: Record<string, number> = {
  'Excessively drained': 60,
  'Somewhat excessively drained': 75,
  'Well drained': 100,
  'Moderately well drained': 80,
  'Somewhat poorly drained': 40,
  'Poorly drained': 15,
  'Very poorly drained': 0,
};

const GOOD_TEXTURES = ['loam', 'silt loam', 'sandy loam', 'silty clay loam', 'clay loam'];
const POOR_TEXTURES = ['sand', 'clay', 'heavy clay', 'gravel'];

export function scoreGardenViability(enrichment: EnrichmentData): HomesteadComponentScore {
  const soilClass = enrichment.soilCapabilityClass;
  const drainage = enrichment.soilDrainageClass;
  const texture = enrichment.soilTexture;

  if (soilClass === undefined && !drainage && !texture) {
    return { score: 50, label: 'Unknown — no soil data available' };
  }

  const classScore = soilClass !== undefined ? (SOIL_CLASS_SCORES[soilClass] ?? 30) : 50;
  const drainageScore = drainage ? (DRAINAGE_SCORES[drainage] ?? 50) : 50;

  let textureScore = 50;
  if (texture) {
    const lower = texture.toLowerCase();
    if (GOOD_TEXTURES.some((t) => lower.includes(t))) textureScore = 90;
    else if (POOR_TEXTURES.some((t) => lower.includes(t))) textureScore = 20;
    else textureScore = 60;
  }

  // Class: 50%, Drainage: 30%, Texture: 20%
  const score = Math.round(classScore * 0.5 + drainageScore * 0.3 + textureScore * 0.2);

  return { score, label: buildLabel(score, soilClass, drainage, texture) };
}

function buildLabel(score: number, soilClass?: number, drainage?: string, texture?: string): string {
  const classStr = soilClass !== undefined ? `Class ${toRoman(soilClass)}` : 'unknown class';
  const textureStr = texture ?? 'unknown texture';
  const drainStr = drainage?.toLowerCase() ?? 'unknown drainage';

  if (score >= 80) return `${classStr} ${textureStr}, ${drainStr} — excellent garden soil`;
  if (score >= 60) return `${classStr} ${textureStr}, ${drainStr} — good garden soil`;
  if (score >= 40) return `${classStr} ${textureStr}, ${drainStr} — moderate garden soil, amendments likely needed`;
  if (score >= 20) return `${classStr} ${textureStr}, ${drainStr} — poor garden soil, significant work required`;
  return `${classStr} ${textureStr}, ${drainStr} — unsuitable for garden use`;
}

const ROMAN_NUMERALS: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII' };

function toRoman(n: number): string {
  return ROMAN_NUMERALS[n] ?? String(n);
}
