import { afterEach, describe, expect, it, vi } from 'vitest';

import { setMetricsSink } from '@landmatch/enrichment';

import { logEnrichmentMetric, registerEnrichmentMetrics } from '../lib/enrichmentMetrics';
import { logger } from '../lib/logger';

vi.mock('@landmatch/enrichment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@landmatch/enrichment')>();
  return { ...actual, setMetricsSink: vi.fn() };
});

afterEach(() => vi.restoreAllMocks());

describe('enrichment metrics logging', () => {
  it('logs metrics as structured enrichment.metric events', () => {
    const spy = vi.spyOn(logger, 'info');

    logEnrichmentMetric({ type: 'adapter', source: 'FEMA NFHL', ok: false, ms: 812.5 });

    expect(spy).toHaveBeenCalledWith(
      { event: 'enrichment.metric', type: 'adapter', source: 'FEMA NFHL', ok: false, ms: 812.5 },
      'enrichment.adapter',
    );
  });

  it('registers the logging sink with the enrichment package', () => {
    registerEnrichmentMetrics();

    expect(setMetricsSink).toHaveBeenCalledWith(logEnrichmentMetric);
  });
});
