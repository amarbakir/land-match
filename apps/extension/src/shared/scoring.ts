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
  if (!zone) return '#6b7280';
  const upper = zone.toUpperCase();
  if (upper === 'X' || upper === 'C' || upper === 'B') return '#22c55e';
  if (upper.startsWith('A') || upper.startsWith('V')) return '#ef4444';
  return '#eab308';
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
  const components: number[] = [];

  if (data.soilCapabilityClass != null) {
    components.push(Math.max(0, 100 - (data.soilCapabilityClass - 1) * 14));
  }

  if (data.femaFloodZone) {
    const upper = data.femaFloodZone.toUpperCase();
    if (upper === 'X' || upper === 'C' || upper === 'B') components.push(95);
    else if (upper.startsWith('A') || upper.startsWith('V')) components.push(20);
    else components.push(50);
  }

  if (components.length === 0) return null;
  return Math.round(components.reduce((a, b) => a + b, 0) / components.length);
}

export function getScoreColor(score: number): string {
  if (score >= 70) return '#22c55e';
  if (score >= 40) return '#eab308';
  return '#ef4444';
}
