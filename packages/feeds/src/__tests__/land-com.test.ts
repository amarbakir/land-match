import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLandComAdapter } from '../adapters/land-com';

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Land.com Listings</title>
    <item>
      <title>5 Acres in Sullivan County, NY - $95,000</title>
      <link>https://www.land.com/property/12345</link>
      <description>5 acre lot with road access and electric available.</description>
      <guid>land-12345</guid>
    </item>
  </channel>
</rss>`;

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Land.com adapter', () => {
  it('parses RSS feed into RawListing array', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(SAMPLE_RSS, { status: 200 }));

    const adapter = createLandComAdapter({ feedUrl: 'https://www.land.com/rss/test' });
    const result = await adapter.fetchListings();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      externalId: 'land-12345',
      source: 'land.com',
      title: expect.stringContaining('5 Acres'),
      url: 'https://www.land.com/property/12345',
    });
  });

  it('extracts price from title', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(SAMPLE_RSS, { status: 200 }));

    const adapter = createLandComAdapter({ feedUrl: 'https://www.land.com/rss/test' });
    const result = await adapter.fetchListings();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data[0].price).toBe(95000);
  });

  it('returns error when fetch fails', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('connection refused'));

    const adapter = createLandComAdapter({ feedUrl: 'https://www.land.com/rss/test' });
    const result = await adapter.fetchListings();

    expect(result.ok).toBe(false);
  });
});
