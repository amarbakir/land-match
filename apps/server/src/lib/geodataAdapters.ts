import {
  createClimateNormalsAdapter,
  createElevationAdapter,
  createWetlandsAdapter,
  registerAdapter,
} from '@landmatch/enrichment';

import { pool } from '../db/client';
import { features } from '../config';

export function registerGeodataAdapters(): void {
  if (!features.enableGeodataEnrichment) return;

  registerAdapter('climateNormals', createClimateNormalsAdapter(pool));
  registerAdapter('elevation', createElevationAdapter(pool));
  registerAdapter('wetlands', createWetlandsAdapter(pool));

  console.log('[geodata] Registered PostGIS enrichment adapters: climateNormals, elevation, wetlands');
}
