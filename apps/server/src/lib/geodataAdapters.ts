import {
  createClimateNormalsAdapter,
  createElevationAdapter,
  createWetlandsAdapter,
  registerAdapter,
} from '@landmatch/enrichment';

import { pool } from '../db/client';
import { features } from '../config';
import { logger } from './logger';

export function registerGeodataAdapters(): void {
  if (!features.enableGeodataEnrichment) return;

  registerAdapter('climateNormals', createClimateNormalsAdapter(pool));
  registerAdapter('elevation', createElevationAdapter(pool));
  registerAdapter('wetlands', createWetlandsAdapter(pool));

  logger.info('registered PostGIS enrichment adapters: climateNormals, elevation, wetlands');
}
