import { describe, expect, it } from 'vitest';

import { deriveEnrichmentStatus } from '../status';

// Bug this guards: listings were hardcoded 'enriched' even when every adapter
// failed, so a vendor outage produced a cohort scored neutral forever.
describe('deriveEnrichmentStatus', () => {
  it("returns 'enriched' when sources succeeded and nothing failed", () => {
    expect(deriveEnrichmentStatus({ sourcesUsed: ['usda-soil', 'fema-nfhl'], errors: [] })).toBe('enriched');
  });

  it("returns 'partial' when some sources succeeded and some failed", () => {
    expect(
      deriveEnrichmentStatus({
        sourcesUsed: ['usda-soil'],
        errors: [{ source: 'fema-nfhl', error: 'FEMA NFHL HTTP 503' }],
      }),
    ).toBe('partial');
  });

  it("returns 'failed' when no source succeeded", () => {
    expect(
      deriveEnrichmentStatus({
        sourcesUsed: [],
        errors: [
          { source: 'usda-soil', error: 'timeout' },
          { source: 'fema-nfhl', error: 'FEMA NFHL HTTP 500' },
        ],
      }),
    ).toBe('failed');
  });

  it("returns 'failed' when nothing ran at all", () => {
    expect(deriveEnrichmentStatus({ sourcesUsed: [], errors: [] })).toBe('failed');
  });
});
