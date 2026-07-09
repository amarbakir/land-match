import { err } from '@landmatch/api';

import { climateAdapter } from './climate';
import { isValidLatLng } from './coords';
import { floodAdapter } from './flood';
import { emitMetric } from './metrics';
import { parcelAdapter } from './parcel';
import { soilAdapter } from './soil';
import type { EnrichmentAdapter, EnrichmentKey, EnrichmentResult, LatLng, Result } from './types';

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

const RETRY_BASE_DELAY_MS = 300;
const RETRY_JITTER_MS = 400;

// Transient vendor failures worth one retry: 5xx responses, throttling (429 —
// ArcGIS reports it inside a 200 body, so only the message carries it), and
// timeout/aborted/network errors. Adapters report errors as strings
// (Result<T>), so classification is by message.
const RETRYABLE_ERROR = /HTTP 5\d\d|\b429\b|too many requests|throttl|timeout|timed out|aborted|network|fetch failed|socket|ECONNRESET|ETIMEDOUT/i;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enrichOnce<T>(adapter: EnrichmentAdapter<T>, coords: LatLng): Promise<Result<T>> {
  const start = performance.now();
  let result: Result<T>;
  try {
    result = await adapter.enrich(coords);
  } catch (e) {
    result = err(`${adapter.name} threw: ${e instanceof Error ? e.message : String(e)}`);
  }
  emitMetric({ type: 'adapter', source: adapter.name, ok: result.ok, ms: performance.now() - start });
  return result;
}

/** One jittered-backoff retry on transient (5xx/timeout/network) failures. Exported for tests. */
export async function enrichWithRetry<T>(
  adapter: EnrichmentAdapter<T>,
  coords: LatLng,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<Result<T>> {
  const first = await enrichOnce(adapter, coords);
  if (first.ok || !RETRYABLE_ERROR.test(first.error)) return first;

  await sleep(RETRY_BASE_DELAY_MS + Math.random() * RETRY_JITTER_MS);
  return enrichOnce(adapter, coords);
}

export interface PipelineOptions {
  // Retrying a timed-out adapter can double the pipeline's worst case
  // (~15s -> ~31s), so it is reserved for background runs (re-enrichment
  // job); interactive requests keep the single-attempt latency and rely on
  // the job to heal partial results.
  retry?: boolean;
}

export async function runEnrichmentPipeline(coords: LatLng, options: PipelineOptions = {}): Promise<EnrichmentResult> {
  // Bad coordinates can't produce data from any vendor — refuse up front
  // instead of burning quota on POINT(NaN NaN)-style requests.
  if (!isValidLatLng(coords)) {
    return {
      sourcesUsed: [],
      errors: [{ source: 'coordinates', error: `invalid coordinates (${coords.lat}, ${coords.lng})` }],
    };
  }

  const allAdapters = [...defaultAdapters, ...additionalAdapters];
  const available = allAdapters.filter((r) => r.adapter.isAvailable());

  const pipelineStart = performance.now();
  // enrichOnce/enrichWithRetry convert adapter throws into error results, so
  // these promises never reject and one adapter can't abort the others.
  const results = await Promise.all(
    available.map(async (r) => ({
      key: r.key,
      name: r.adapter.name,
      result: options.retry ? await enrichWithRetry(r.adapter, coords) : await enrichOnce(r.adapter, coords),
    })),
  );

  const enrichment: EnrichmentResult = {
    sourcesUsed: [],
    errors: [],
  };

  for (const { key, name, result } of results) {
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
