import { climateAdapter } from './climate';
import { floodAdapter } from './flood';
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
  additionalAdapters.push({ key, adapter });
}

export function clearAdditionalAdapters(): void {
  additionalAdapters.length = 0;
}

export async function runEnrichmentPipeline(coords: LatLng): Promise<EnrichmentResult> {
  const allAdapters = [...defaultAdapters, ...additionalAdapters];
  const available = allAdapters.filter((r) => r.adapter.isAvailable());

  const results = await Promise.allSettled(
    available.map((r) => r.adapter.enrich(coords).then((result) => ({ key: r.key, name: r.adapter.name, result }))),
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

  return enrichment;
}

function assignResult(enrichment: EnrichmentResult, key: EnrichmentKey, data: unknown): void {
  switch (key) {
    case 'soil':
      enrichment.soil = data as EnrichmentResult['soil'];
      break;
    case 'flood':
      enrichment.flood = data as EnrichmentResult['flood'];
      break;
    case 'parcel':
      enrichment.parcel = data as EnrichmentResult['parcel'];
      break;
    case 'climate':
      enrichment.climate = data as EnrichmentResult['climate'];
      break;
    case 'climateNormals':
      enrichment.climateNormals = data as EnrichmentResult['climateNormals'];
      break;
    case 'elevation':
      enrichment.elevation = data as EnrichmentResult['elevation'];
      break;
    case 'wetlands':
      enrichment.wetlands = data as EnrichmentResult['wetlands'];
      break;
  }
}
