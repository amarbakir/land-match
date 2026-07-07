export type EnrichmentMetric =
  | { type: 'geocode'; ok: boolean; ms: number }
  | { type: 'adapter'; source: string; ok: boolean; ms: number }
  | { type: 'pipeline'; ms: number; sourcesUsed: number; errors: number };

export type MetricsSink = (metric: EnrichmentMetric) => void;

// This package has no logging dependency; the host process (server) injects a
// sink at startup to forward metrics to its logger, mirroring registerAdapter.
let sink: MetricsSink | null = null;

export function setMetricsSink(fn: MetricsSink | null): void {
  sink = fn;
}

export function emitMetric(metric: EnrichmentMetric): void {
  if (!sink) return;
  try {
    sink(metric);
  } catch {
    // metrics must never break enrichment
  }
}
