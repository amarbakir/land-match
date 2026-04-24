import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearAdditionalAdapters, registerAdapter, runEnrichmentPipeline } from '../pipeline';
import type { EnrichmentAdapter, ElevationData } from '../types';

// The default adapters (soil, flood, parcel, climate) all have isAvailable
// checks that gate on env vars or return true. We don't mock them here —
// the pipeline runs them for real, and their test suites cover their behavior.
// These tests focus on the registration mechanism.

function fakeAdapter(data: ElevationData): EnrichmentAdapter<ElevationData> {
  return {
    name: 'test-elevation',
    isAvailable: () => true,
    enrich: vi.fn().mockResolvedValue({ ok: true, data }),
  };
}

afterEach(() => {
  clearAdditionalAdapters();
});

describe('registerAdapter + pipeline integration', () => {
  it('registered adapter data appears in pipeline result under its key', async () => {
    // Bug this catches: if assignResult switch is missing a case for a new key,
    // the adapter runs but its data silently disappears from the result.
    const elevData: ElevationData = { elevationFt: 1200, slopePct: 5.3 };
    registerAdapter('elevation', fakeAdapter(elevData));

    const result = await runEnrichmentPipeline({ lat: 43.1, lng: -72.78 });

    expect(result.elevation).toEqual(elevData);
    expect(result.sourcesUsed).toContain('test-elevation');
  });

  it('clearAdditionalAdapters removes registered adapters from next run', async () => {
    // Bug this catches: if clearAdditionalAdapters doesn't actually clear
    // the array, adapters accumulate across test runs or server restarts,
    // causing duplicate enrichment or memory leaks.
    registerAdapter('elevation', fakeAdapter({ elevationFt: 1200, slopePct: 5.3 }));
    clearAdditionalAdapters();

    const result = await runEnrichmentPipeline({ lat: 43.1, lng: -72.78 });

    expect(result.elevation).toBeUndefined();
    expect(result.sourcesUsed).not.toContain('test-elevation');
  });

  it('failing registered adapter does not crash other adapters', async () => {
    // Bug this catches: if Promise.allSettled is replaced with Promise.all,
    // one adapter throwing would abort all others.
    const crashAdapter: EnrichmentAdapter<ElevationData> = {
      name: 'crash-adapter',
      isAvailable: () => true,
      enrich: vi.fn().mockRejectedValue(new Error('segfault')),
    };
    registerAdapter('elevation', crashAdapter);

    const result = await runEnrichmentPipeline({ lat: 43.1, lng: -72.78 });

    // Pipeline still completes — default adapters ran
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.error.includes('segfault'))).toBe(true);
    // Soil adapter (default, always available) should still have run
    expect(result.sourcesUsed).toContain('usda-soil');
  });

  it('unavailable registered adapter is skipped entirely', async () => {
    // Bug this catches: if the isAvailable() filter is bypassed,
    // disabled adapters would query PostGIS and fail or return stale data.
    const disabledAdapter: EnrichmentAdapter<ElevationData> = {
      name: 'disabled-adapter',
      isAvailable: () => false,
      enrich: vi.fn().mockResolvedValue({ ok: true, data: { elevationFt: 0, slopePct: 0 } }),
    };
    registerAdapter('elevation', disabledAdapter);

    const result = await runEnrichmentPipeline({ lat: 43.1, lng: -72.78 });

    expect(disabledAdapter.enrich).not.toHaveBeenCalled();
    expect(result.elevation).toBeUndefined();
  });
});
