import { describe, expect, it } from 'vitest';
import { ok, err } from '@landmatch/api';

import { runFeedIngestion } from '../orchestrator';
import type { FeedAdapter, RawListing } from '../types';

function makeListing(overrides: Partial<RawListing> = {}): RawListing {
  return {
    externalId: 'ext-1',
    source: 'test',
    url: 'https://example.com/listing/1',
    title: '10 Acres in Vermont',
    rawData: {},
    ...overrides,
  };
}

function makeAdapter(name: string, listings: RawListing[]): FeedAdapter {
  return { name, fetchListings: async () => ok(listings) };
}

function makeFailingAdapter(name: string, error: string): FeedAdapter {
  return { name, fetchListings: async () => err(error) };
}

describe('runFeedIngestion', () => {
  it('aggregates listings from multiple adapters', async () => {
    const adapter1 = makeAdapter('source-a', [makeListing({ externalId: '1', source: 'source-a' })]);
    const adapter2 = makeAdapter('source-b', [makeListing({ externalId: '2', source: 'source-b' })]);

    const result = await runFeedIngestion([adapter1, adapter2]);

    expect(result.listings).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it('captures adapter errors without failing the whole run', async () => {
    const good = makeAdapter('good', [makeListing()]);
    const bad = makeFailingAdapter('bad', 'network timeout');

    const result = await runFeedIngestion([good, bad]);

    expect(result.listings).toHaveLength(1);
    expect(result.errors).toEqual([{ adapter: 'bad', error: 'network timeout' }]);
  });

  it('handles adapter throwing an exception', async () => {
    const throwing: FeedAdapter = {
      name: 'exploder',
      fetchListings: async () => { throw new Error('kaboom'); },
    };

    const result = await runFeedIngestion([throwing]);

    expect(result.listings).toHaveLength(0);
    expect(result.errors).toEqual([{ adapter: 'exploder', error: 'kaboom' }]);
  });

  it('returns empty result for no adapters', async () => {
    const result = await runFeedIngestion([]);

    expect(result.listings).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});
