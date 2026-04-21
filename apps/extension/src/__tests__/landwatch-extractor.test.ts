/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { landwatchExtractor } from '../content/extractors/landwatch';

function setUrl(url: string) {
  // jsdom's window.location is not configurable, but we can replace href
  Object.defineProperty(window, 'location', {
    value: { href: url },
    writable: true,
    configurable: true,
  });
}

describe('landwatchExtractor.matches', () => {
  it('matches LandWatch detail pages with numeric ID suffix', () => {
    expect(landwatchExtractor.matches('https://www.landwatch.com/land/some-slug/12345678')).toBe(true);
  });

  it('rejects LandWatch search/index pages without numeric suffix', () => {
    expect(landwatchExtractor.matches('https://www.landwatch.com/land-for-sale')).toBe(false);
  });

  it('rejects non-LandWatch URLs', () => {
    expect(landwatchExtractor.matches('https://www.zillow.com/homedetails/123')).toBe(false);
  });
});

describe('landwatchExtractor.extract', () => {
  afterEach(() => {
    // Clean up DOM between tests
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('extracts address, price, and title from ld+json structured data', () => {
    setUrl('https://www.landwatch.com/elko-county-nevada-land-for-sale/pid/99887766');

    document.body.innerHTML = `
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'Product',
        name: '40 Acres in Elko County',
        address: {
          streetAddress: '123 Range Rd',
          addressLocality: 'Elko',
          addressRegion: 'NV',
          postalCode: '89801',
        },
        offers: { price: '59900' },
      })}</script>
      <h1>40 Acres in Elko County</h1>
    `;

    const result = landwatchExtractor.extract(document);

    expect(result).not.toBeNull();
    expect(result!.address).toBe('123 Range Rd, Elko, NV, 89801');
    expect(result!.price).toBe(59900);
    expect(result!.title).toBe('40 Acres in Elko County');
    expect(result!.source).toBe('landwatch');
    expect(result!.externalId).toBe('99887766');
  });

  it('returns null when no address can be extracted', () => {
    // Bug this catches: if we push enrichment requests without an address,
    // the server geocode fails and we waste API calls
    setUrl('https://www.landwatch.com/something/12345');
    document.body.innerHTML = '<h1>Some Page</h1>';

    const result = landwatchExtractor.extract(document);
    expect(result).toBeNull();
  });

  it('falls back to DOM scraping when ld+json is missing', () => {
    setUrl('https://www.landwatch.com/boise-land/55667788');

    document.body.innerHTML = `
      <h1>Beautiful 10 Acre Ranch</h1>
      <div class="property-address">456 Valley View, Boise, ID 83702</div>
      <div class="property-price">$125,000</div>
      <div class="property-detail">10.5 acres</div>
    `;

    const result = landwatchExtractor.extract(document);

    expect(result).not.toBeNull();
    expect(result!.address).toBe('456 Valley View, Boise, ID 83702');
    expect(result!.price).toBe(125000);
    expect(result!.acreage).toBe(10.5);
  });

  it('ld+json takes priority over DOM when both are present', () => {
    // Bug this catches: if merge order is wrong, unreliable DOM data
    // overwrites the more reliable structured data
    setUrl('https://www.landwatch.com/land/11223344');

    document.body.innerHTML = `
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'Product',
        name: 'Structured Title',
        address: {
          streetAddress: 'Correct Address',
          addressLocality: 'Correct City',
          addressRegion: 'NV',
        },
      })}</script>
      <h1>DOM Title</h1>
      <div class="property-address">Wrong Address from DOM</div>
    `;

    const result = landwatchExtractor.extract(document);

    expect(result!.address).toBe('Correct Address, Correct City, NV');
    expect(result!.title).toBe('Structured Title');
  });

  it('handles malformed ld+json gracefully without crashing', () => {
    setUrl('https://www.landwatch.com/tx-land/44556677');

    document.body.innerHTML = `
      <script type="application/ld+json">{ not valid json }</script>
      <div class="property-address">Fallback Address, TX 75001</div>
    `;

    // Should not throw, and should fall back to DOM
    const result = landwatchExtractor.extract(document);
    expect(result).not.toBeNull();
    expect(result!.address).toBe('Fallback Address, TX 75001');
  });

  it('extracts acreage from text with commas and varying formats', () => {
    setUrl('https://www.landwatch.com/mt-land/99001122');

    document.body.innerHTML = `
      <div class="property-address">Rural Route, MT 59001</div>
      <dd>1,200.5 acres available</dd>
    `;

    const result = landwatchExtractor.extract(document);
    expect(result!.acreage).toBe(1200.5);
  });
});
