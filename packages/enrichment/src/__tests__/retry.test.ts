import { describe, expect, it, vi } from 'vitest';

import { enrichWithRetry } from '../pipeline';
import type { EnrichmentAdapter, FloodData } from '../types';

const COORDS = { lat: 36.6, lng: -92.1 };

function adapterReturning(results: Array<{ ok: true; data: FloodData } | { ok: false; error: string }>) {
  const enrich = vi.fn();
  for (const r of results) enrich.mockResolvedValueOnce(r);
  const adapter: EnrichmentAdapter<FloodData> = {
    name: 'test-flood',
    isAvailable: () => true,
    enrich,
  };
  return { adapter, enrich };
}

const okResult = { ok: true as const, data: { zone: 'X', description: 'minimal' } };

describe('enrichWithRetry', () => {
  it('retries once after a 5xx failure and returns the second result', async () => {
    const { adapter, enrich } = adapterReturning([{ ok: false, error: 'FEMA NFHL HTTP 503' }, okResult]);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await enrichWithRetry(adapter, COORDS, sleep);

    expect(result).toEqual(okResult);
    expect(enrich).toHaveBeenCalledTimes(2);
    // Jittered backoff: bounded, non-zero delay before the retry
    expect(sleep).toHaveBeenCalledTimes(1);
    const delay = sleep.mock.calls[0][0];
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(1000);
  });

  it('retries once after a timeout and gives up if the retry also fails', async () => {
    const { adapter, enrich } = adapterReturning([
      { ok: false, error: 'USDA soil failed: The operation timed out' },
      { ok: false, error: 'USDA soil failed: The operation timed out' },
    ]);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await enrichWithRetry(adapter, COORDS, sleep);

    expect(result.ok).toBe(false);
    // Exactly one retry — a hard outage must not amplify into a retry storm
    expect(enrich).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-transient failures', async () => {
    const { adapter, enrich } = adapterReturning([
      { ok: false, error: 'FEMA NFHL unexpected response shape' },
      okResult,
    ]);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await enrichWithRetry(adapter, COORDS, sleep);

    expect(result.ok).toBe(false);
    expect(enrich).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not retry successful results', async () => {
    const { adapter, enrich } = adapterReturning([okResult]);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await enrichWithRetry(adapter, COORDS, sleep);

    expect(enrich).toHaveBeenCalledTimes(1);
  });

  it('converts a thrown transient error into a retried failure result', async () => {
    const enrich = vi
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce(okResult);
    const adapter: EnrichmentAdapter<FloodData> = { name: 'test-flood', isAvailable: () => true, enrich };
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await enrichWithRetry(adapter, COORDS, sleep);

    expect(result).toEqual(okResult);
    expect(enrich).toHaveBeenCalledTimes(2);
  });
});
