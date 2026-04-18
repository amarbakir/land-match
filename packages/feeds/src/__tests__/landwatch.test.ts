import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLandWatchAdapter } from '../adapters/landwatch';

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>LandWatch Listings</title>
    <item>
      <title>10 Acres - Rural Farm Land</title>
      <link>https://www.landwatch.com/property/123456</link>
      <description>Beautiful 10 acre parcel in Greene County, NY. $150,000. Perfect for homesteading.</description>
      <guid>123456</guid>
    </item>
    <item>
      <title>25 Acres - Mountain Property</title>
      <link>https://www.landwatch.com/property/789012</link>
      <description>25 acres in Ulster County, NY. $275,000. Views of the Catskills.</description>
      <guid>789012</guid>
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

describe('LandWatch adapter', () => {
  it('parses RSS feed into RawListing array', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(SAMPLE_RSS, { status: 200 }));

    const adapter = createLandWatchAdapter({ feedUrl: 'https://www.landwatch.com/rss/test' });
    const result = await adapter.fetchListings();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toMatchObject({
      externalId: '123456',
      source: 'landwatch',
      title: '10 Acres - Rural Farm Land',
      url: 'https://www.landwatch.com/property/123456',
    });
  });

  it('extracts price from description when available', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(SAMPLE_RSS, { status: 200 }));

    const adapter = createLandWatchAdapter({ feedUrl: 'https://www.landwatch.com/rss/test' });
    const result = await adapter.fetchListings();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data[0].price).toBe(150000);
  });

  it('extracts acreage from title when available', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(SAMPLE_RSS, { status: 200 }));

    const adapter = createLandWatchAdapter({ feedUrl: 'https://www.landwatch.com/rss/test' });
    const result = await adapter.fetchListings();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data[0].acreage).toBe(10);
  });

  it('returns error when fetch fails', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network error'));

    const adapter = createLandWatchAdapter({ feedUrl: 'https://www.landwatch.com/rss/test' });
    const result = await adapter.fetchListings();

    expect(result.ok).toBe(false);
  });
});
