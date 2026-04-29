// Import directly from components to avoid pulling in Node-only transitive deps
// (scoring/index.ts re-exports mapEnrichment which imports @landmatch/enrichment)
import { scoreSoil, scoreFlood } from '@landmatch/scoring/components';
import type { HomesteadScores } from '@landmatch/scoring';

export const SOIL_LABELS: Record<number, string> = {
  1: 'Class I — Few limitations',
  2: 'Class II — Moderate limitations',
  3: 'Class III — Severe limitations',
  4: 'Class IV — Very severe limitations',
  5: 'Class V — Unsuitable for cultivation',
  6: 'Class VI — Severe limitations, pasture only',
  7: 'Class VII — Very severe, woodland only',
  8: 'Class VIII — Recreation/wildlife only',
};

export function getSoilLabel(cls: number | null): string {
  if (cls == null) return 'Unknown';
  return SOIL_LABELS[cls] ?? `Class ${cls}`;
}

export function getFloodColor(zone: string | null): string {
  if (!zone) return '#6B7363';
  const upper = zone.toUpperCase();
  if (upper === 'X' || upper === 'C' || upper === 'B') return '#7DB88A';
  if (upper.startsWith('A') || upper.startsWith('V')) return '#DC2626';
  return '#D4A843';
}

export function getFloodLabel(zone: string | null): string {
  if (!zone) return 'Unknown';
  const upper = zone.toUpperCase();
  if (upper === 'X') return 'Minimal risk';
  if (upper === 'A' || upper === 'AE') return 'High risk (100-yr floodplain)';
  if (upper === 'V' || upper === 'VE') return 'High risk (coastal flood)';
  return zone;
}

export interface EnrichmentScoreInput {
  soilCapabilityClass: number | null;
  femaFloodZone: string | null;
}

export function computeSimplifiedScore(data: EnrichmentScoreInput): number | null {
  const hasSoil = data.soilCapabilityClass != null;
  const hasFlood = !!data.femaFloodZone;

  if (!hasSoil && !hasFlood) return null;

  const components: number[] = [];
  if (hasSoil) components.push(scoreSoil(data.soilCapabilityClass ?? undefined));
  if (hasFlood) components.push(scoreFlood(data.femaFloodZone ?? undefined, []));

  return Math.round(components.reduce((a, b) => a + b, 0) / components.length);
}

export type ScoreTier = 'high' | 'mid' | 'low' | 'fail';

export function getScoreTier(score: number): ScoreTier {
  if (score >= 80) return 'high';
  if (score >= 60) return 'mid';
  if (score >= 40) return 'low';
  return 'fail';
}

export function getScoreColor(score: number): string {
  const tier = getScoreTier(score);
  if (tier === 'high') return '#7DB88A';
  if (tier === 'mid') return '#C4956A';
  if (tier === 'low') return '#D4A843';
  return '#DC2626';
}

export function getOverallScore(data: { homesteadScore?: number | null; enrichment: EnrichmentScoreInput }): number | null {
  if (data.homesteadScore != null) return Math.round(data.homesteadScore);
  return computeSimplifiedScore(data.enrichment);
}

export const HOMESTEAD_COMPONENT_LABELS: Record<keyof HomesteadScores, string> = {
  gardenViability: 'Garden Viability',
  growingSeason: 'Growing Season',
  waterAvailability: 'Water Availability',
  floodSafety: 'Flood Safety',
  septicFeasibility: 'Septic Feasibility',
  buildingSuitability: 'Building Suitability',
  firewoodPotential: 'Firewood Potential',
};

export const HOMESTEAD_DISPLAY_ORDER: Array<keyof HomesteadScores> = [
  'gardenViability',
  'growingSeason',
  'waterAvailability',
  'floodSafety',
  'septicFeasibility',
  'buildingSuitability',
  'firewoodPotential',
];
