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
  it('tags listings with land.com source name', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(SAMPLE_RSS, { status: 200 }));

    const adapter = createLandComAdapter({ feedUrl: 'https://www.land.com/rss/test' });
    expect(adapter.name).toBe('land.com');

    const result = await adapter.fetchListings();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data[0].source).toBe('land.com');
    expect(result.data[0].externalId).toBe('land-12345');
  });
});
