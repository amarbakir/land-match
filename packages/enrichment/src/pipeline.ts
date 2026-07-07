import { climateAdapter } from './climate';
import { floodAdapter } from './flood';
import { emitMetric } from './metrics';
import { parcelAdapter } from './parcel';
import { soilAdapter } from './soil';
import type { EnrichmentAdapter, EnrichmentKey, EnrichmentResult, LatLng } from './types';

interface RegisteredAdapter {
  key: EnrichmentKey;
  adapter: EnrichmentAdapter<unknown>;
}

const defaultAdapters: RegisteredAdapter[] = [
  { key: 'soil', adapter: soilAdapter },
  { key: 'flood', adapter: floodAdapter },
  { key: 'parcel', adapter: parcelAdapter },
  { key: 'climate', adapter: climateAdapter },
];

const additionalAdapters: RegisteredAdapter[] = [];

export function registerAdapter(key: EnrichmentKey, adapter: EnrichmentAdapter<unknown>): void {
  if (!additionalAdapters.some((r) => r.key === key)) {
    additionalAdapters.push({ key, adapter });
  }
}

export function clearAdditionalAdapters(): void {
  additionalAdapters.length = 0;
}

export async function runEnrichmentPipeline(coords: LatLng): Promise<EnrichmentResult> {
  const allAdapters = [...defaultAdapters, ...additionalAdapters];
  const available = allAdapters.filter((r) => r.adapter.isAvailable());

  const pipelineStart = performance.now();
  const results = await Promise.allSettled(
    available.map(async (r) => {
      const start = performance.now();
      try {
        const result = await r.adapter.enrich(coords);
        emitMetric({ type: 'adapter', source: r.adapter.name, ok: result.ok, ms: performance.now() - start });
        return { key: r.key, name: r.adapter.name, result };
      } catch (e) {
        emitMetric({ type: 'adapter', source: r.adapter.name, ok: false, ms: performance.now() - start });
        throw e;
      }
    }),
  );

  const enrichment: EnrichmentResult = {
    sourcesUsed: [],
    errors: [],
  };

  for (const settled of results) {
    if (settled.status === 'rejected') {
      enrichment.errors.push({ source: 'unknown', error: String(settled.reason) });
      continue;
    }

    const { key, name, result } = settled.value;

    if (!result.ok) {
      enrichment.errors.push({ source: name, error: result.error });
      continue;
    }

    enrichment.sourcesUsed.push(name);
    assignResult(enrichment, key, result.data);
  }

  emitMetric({
    type: 'pipeline',
    ms: performance.now() - pipelineStart,
    sourcesUsed: enrichment.sourcesUsed.length,
    errors: enrichment.errors.length,
  });

  return enrichment;
}

function assignResult(enrichment: EnrichmentResult, key: EnrichmentKey, data: unknown): void {
  // EnrichmentKey is derived from EnrichmentResult keys, so direct assignment is safe
  (enrichment as unknown as Record<string, unknown>)[key] = data;
}
