import { setMetricsSink, type EnrichmentMetric } from '@landmatch/enrichment';

import { logger } from './logger';

export function logEnrichmentMetric(metric: EnrichmentMetric): void {
  logger.info({ event: 'enrichment.metric', ...metric }, `enrichment.${metric.type}`);
}

export function registerEnrichmentMetrics(): void {
  setMetricsSink(logEnrichmentMetric);
}
