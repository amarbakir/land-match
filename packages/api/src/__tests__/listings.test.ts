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

  it('rejects titles longer than 200 characters', () => {
    expect(EnrichListingRequest.safeParse({ ...base, title: 'x'.repeat(201) }).success).toBe(false);
    expect(EnrichListingRequest.safeParse({ ...base, title: 'x'.repeat(200) }).success).toBe(true);
  });

  it('rejects source/externalId longer than 100 characters', () => {
    expect(EnrichListingRequest.safeParse({ ...base, source: 'x'.repeat(101) }).success).toBe(false);
    expect(EnrichListingRequest.safeParse({ ...base, externalId: 'x'.repeat(101) }).success).toBe(false);
    expect(EnrichListingRequest.safeParse({ ...base, source: 'zillow', externalId: 'zpid-1' }).success).toBe(true);
  });
});
