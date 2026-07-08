import { describe, expect, it } from 'vitest';

import { EnrichListingRequest, HttpUrl, isHttpUrl, ListingByUrlQuery } from '../index';

describe('HttpUrl', () => {
  it.each([
    'https://www.landwatch.com/listing/123',
    'http://example.com/land?id=4&ref=a',
  ])('accepts web URL %s', (url) => {
    expect(HttpUrl.safeParse(url).success).toBe(true);
  });

  // Bug this catches: z.string().url() alone accepts any valid URI, so a
  // javascript: URL passes validation, gets stored, and later renders as a
  // clickable link in dashboards and alert emails (stored XSS → token theft).
  it.each([
    'javascript:alert(document.cookie)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'vbscript:msgbox(1)',
  ])('rejects non-web scheme %s', (url) => {
    expect(HttpUrl.safeParse(url).success).toBe(false);
  });
});

describe('isHttpUrl', () => {
  // Bug this catches: the read-side sanitizer diverging from the write-side
  // schema — a URL accepted at write time must never be stripped at read time,
  // and vice versa. isHttpUrl is derived from HttpUrl to guarantee this.
  it('agrees with HttpUrl for stored values', () => {
    for (const value of [
      'https://www.landwatch.com/listing/123',
      'javascript:alert(1)',
      'http:/www.landwatch.com/listing/123',
      'not a url',
    ]) {
      expect(isHttpUrl(value)).toBe(HttpUrl.safeParse(value).success);
    }
  });

  it('rejects null and undefined (nullable DB columns)', () => {
    expect(isHttpUrl(null)).toBe(false);
    expect(isHttpUrl(undefined)).toBe(false);
  });
});

describe('listing schemas enforce web-only URLs', () => {
  it('EnrichListingRequest rejects a javascript: url', () => {
    const result = EnrichListingRequest.safeParse({
      address: '123 Rural Rd, MO',
      url: 'javascript:alert(document.cookie)',
    });
    expect(result.success).toBe(false);
  });

  it('EnrichListingRequest still accepts a normal listing url', () => {
    const result = EnrichListingRequest.safeParse({
      address: '123 Rural Rd, MO',
      url: 'https://www.landwatch.com/listing/123',
    });
    expect(result.success).toBe(true);
  });

  it('ListingByUrlQuery rejects a javascript: url', () => {
    expect(ListingByUrlQuery.safeParse({ url: 'javascript:alert(1)' }).success).toBe(false);
  });
});
