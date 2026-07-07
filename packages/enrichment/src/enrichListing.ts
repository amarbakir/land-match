import { err, ok } from '@landmatch/api';

import { geocode } from './geocode';
import type { GeocodeData } from './geocode';
import { emitMetric } from './metrics';
import { runEnrichmentPipeline } from './pipeline';
import type { EnrichmentResult, Result } from './types';

export interface EnrichedListing {
  geocode: GeocodeData;
  enrichment: EnrichmentResult;
}

export async function enrichListing(address: string): Promise<Result<EnrichedListing>> {
  const geocodeStart = performance.now();
  const geocodeResult = await geocode(address);
  emitMetric({ type: 'geocode', ok: geocodeResult.ok, ms: performance.now() - geocodeStart });

  if (!geocodeResult.ok) {
    return err(geocodeResult.error);
  }

  const { lat, lng } = geocodeResult.data;
  const enrichment = await runEnrichmentPipeline({ lat, lng });

  return ok({
    geocode: geocodeResult.data,
    enrichment,
  });
}
