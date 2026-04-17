import { climateAdapter } from './climate';
import { floodAdapter } from './flood';
import { parcelAdapter } from './parcel';
import { soilAdapter } from './soil';
import type { EnrichmentAdapter, EnrichmentResult, LatLng } from './types';

const adapters: EnrichmentAdapter<unknown>[] = [soilAdapter, floodAdapter, parcelAdapter, climateAdapter];

export async function runEnrichmentPipeline(coords: LatLng): Promise<EnrichmentResult> {
  const available = adapters.filter((a) => a.isAvailable());

  const results = await Promise.allSettled(available.map((a) => a.enrich(coords).then((r) => ({ name: a.name, result: r }))));

  const enrichment: EnrichmentResult = {
    sourcesUsed: [],
    errors: [],
  };

  for (const settled of results) {
    if (settled.status === 'rejected') {
      enrichment.errors.push({ source: 'unknown', error: String(settled.reason) });
      continue;
    }

    const { name, result } = settled.value;

    if (!result.ok) {
      enrichment.errors.push({ source: name, error: result.error });
      continue;
    }

    enrichment.sourcesUsed.push(name);

    switch (name) {
      case 'usda-soil':
        enrichment.soil = result.data as EnrichmentResult['soil'];
        break;
      case 'fema-nfhl':
        enrichment.flood = result.data as EnrichmentResult['flood'];
        break;
      case 'regrid':
        enrichment.parcel = result.data as EnrichmentResult['parcel'];
        break;
      case 'first-street':
        enrichment.climate = result.data as EnrichmentResult['climate'];
        break;
    }
  }

  return enrichment;
}
