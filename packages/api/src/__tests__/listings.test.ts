import { describe, it, expect } from 'vitest';

import { EnrichListingRequest } from '../listings';

// Bugs these catch (tcd.3 audit): every field was unbounded under the global
// 100KB body limit — a 90KB address still reached the Census/Nominatim
// geocoders as a query param and landed in listings.address; unbounded titles
// flow into email subjects and the (dormant) LLM prompt.
describe('EnrichListingRequest field caps', () => {
  const base = { address: '123 Rural Rd, MO' };

  it('rejects addresses longer than 500 characters (matches the geocoder response bound)', () => {
    expect(EnrichListingRequest.safeParse({ address: 'x'.repeat(501) }).success).toBe(false);
    expect(EnrichListingRequest.safeParse({ address: 'x'.repeat(500) }).success).toBe(true);
  });

  it('truncates over-long titles instead of rejecting the whole request', () => {
    // The extension sends scraped third-party titles verbatim — a 300-char
    // marketing headline must not make the listing un-enrichable.
    const result = EnrichListingRequest.safeParse({ ...base, title: 'x'.repeat(300) });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toHaveLength(200);
  });

  it('does not leave a split surrogate pair at the title truncation point', () => {
    const title = `${'x'.repeat(199)}🌲end`; // pair straddles index 200
    const result = EnrichListingRequest.safeParse({ ...base, title });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBe('x'.repeat(199));
  });

  it('rejects enrich URLs longer than 2048 characters (write boundary only)', () => {
    const long = `https://example.com/${'x'.repeat(2048)}`;
    expect(EnrichListingRequest.safeParse({ ...base, url: long }).success).toBe(false);
  });

  it('rejects source/externalId longer than 100 characters', () => {
    expect(EnrichListingRequest.safeParse({ ...base, source: 'x'.repeat(101) }).success).toBe(false);
    expect(EnrichListingRequest.safeParse({ ...base, externalId: 'x'.repeat(101) }).success).toBe(false);
    expect(EnrichListingRequest.safeParse({ ...base, source: 'zillow', externalId: 'zpid-1' }).success).toBe(true);
  });
});
