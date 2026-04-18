import { err, ok } from '@landmatch/api';

import { geocode } from './geocode';
import type { GeocodeData } from './geocode';
import { runEnrichmentPipeline } from './pipeline';
import type { EnrichmentResult, Result } from './types';

export interface EnrichedListing {
  geocode: GeocodeData;
  enrichment: EnrichmentResult;
}

export async function enrichListing(address: string): Promise<Result<EnrichedListing>> {
  const geocodeResult = await geocode(address);

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
