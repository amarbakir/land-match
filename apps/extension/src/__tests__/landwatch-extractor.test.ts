/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { landwatchExtractor } from '../content/extractors/landwatch';

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
    const url = 'https://www.landwatch.com/elko-county-nevada-land-for-sale/pid/99887766';

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

    const result = landwatchExtractor.extract(document, url);

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
    const url = 'https://www.landwatch.com/something/12345';
    document.body.innerHTML = '<h1>Some Page</h1>';

    const result = landwatchExtractor.extract(document, url);
    expect(result).toBeNull();
  });

  it('falls back to DOM scraping when ld+json is missing', () => {
    const url = 'https://www.landwatch.com/boise-land/55667788';

    document.body.innerHTML = `
      <h1>Beautiful 10 Acre Ranch</h1>
      <div class="property-address">456 Valley View, Boise, ID 83702</div>
      <div class="property-price">$125,000</div>
      <div class="property-detail">10.5 acres</div>
    `;

    const result = landwatchExtractor.extract(document, url);

    expect(result).not.toBeNull();
    expect(result!.address).toBe('456 Valley View, Boise, ID 83702');
    expect(result!.price).toBe(125000);
    expect(result!.acreage).toBe(10.5);
  });

  it('ld+json takes priority over DOM when both are present', () => {
    // Bug this catches: if merge order is wrong, unreliable DOM data
    // overwrites the more reliable structured data
    const url = 'https://www.landwatch.com/land/11223344';

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

    const result = landwatchExtractor.extract(document, url);

    expect(result!.address).toBe('Correct Address, Correct City, NV');
    expect(result!.title).toBe('Structured Title');
  });

  it('handles SingleFamilyResidence @type with direct address', () => {
    const url = 'https://www.landwatch.com/monroe-county-land/pid/426490658';

    document.body.innerHTML = `
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'SingleFamilyResidence',
        name: '157 acres in Monroe County, Wisconsin',
        address: {
          '@type': 'PostalAddress',
          streetAddress: '21881 Kale Road',
          addressLocality: 'Sparta',
          addressRegion: 'WI',
          postalCode: '54656',
        },
      })}</script>
      <h1>21881 Kale Road , Sparta, WI 54656(Monroe County)</h1>
    `;

    const result = landwatchExtractor.extract(document, url);

    expect(result).not.toBeNull();
    expect(result!.address).toBe('21881 Kale Road, Sparta, WI, 54656');
    expect(result!.acreage).toBe(157);
  });

  it('handles array @type like [RealEstateListing, Product]', () => {
    const url = 'https://www.landwatch.com/land/pid/123456';

    document.body.innerHTML = `
      <script type="application/ld+json">${JSON.stringify({
        '@type': ['RealEstateListing', 'Product'],
        name: 'Test Listing',
        mainEntity: {
          '@type': 'Residence',
          address: {
            streetAddress: '100 Oak St',
            addressLocality: 'Madison',
            addressRegion: 'WI',
            postalCode: '53703',
          },
        },
        offers: { price: 250000 },
      })}</script>
      <h1>100 Oak St , Madison, WI 53703</h1>
    `;

    const result = landwatchExtractor.extract(document, url);

    expect(result).not.toBeNull();
    expect(result!.address).toBe('100 Oak St, Madison, WI, 53703');
    expect(result!.price).toBe(250000);
  });

  it('merges data across multiple LD+JSON blocks', () => {
    const url = 'https://www.landwatch.com/land/pid/555555';

    document.body.innerHTML = `
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'SingleFamilyResidence',
        address: {
          streetAddress: '50 River Rd',
          addressLocality: 'Burlington',
          addressRegion: 'VT',
          postalCode: '05401',
        },
      })}</script>
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'Product',
        name: '80 acres in Chittenden County',
        offers: { price: 320000 },
      })}</script>
      <h1>50 River Rd , Burlington, VT 05401</h1>
    `;

    const result = landwatchExtractor.extract(document, url);

    expect(result).not.toBeNull();
    expect(result!.address).toBe('50 River Rd, Burlington, VT, 05401');
    expect(result!.price).toBe(320000);
    expect(result!.acreage).toBe(80);
  });

  it('extracts address from h1 when it contains street address pattern', () => {
    const url = 'https://www.landwatch.com/land/pid/777777';

    document.body.innerHTML = `
      <h1>123 Farm Lane , Stowe, VT 05672(Lamoille County)</h1>
    `;

    const result = landwatchExtractor.extract(document, url);

    expect(result).not.toBeNull();
    expect(result!.address).toBe('123 Farm Lane , Stowe, VT 05672');
  });

  it('skips an ld+json block whose name is not a string instead of crashing', () => {
    // Bug this catches: parseAcreage(data.name) on a numeric name throws a
    // TypeError that propagates out of the content script — no message is
    // ever sent for the page
    const url = 'https://www.landwatch.com/land/pid/888888';

    document.body.innerHTML = `
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'Product',
        name: 12345,
      })}</script>
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'Product',
        name: '60 acres in Vernon County',
        address: {
          streetAddress: '10 Ridge Rd',
          addressLocality: 'Viroqua',
          addressRegion: 'WI',
        },
      })}</script>
    `;

    const result = landwatchExtractor.extract(document, url);
    expect(result).not.toBeNull();
    expect(result!.address).toBe('10 Ridge Rd, Viroqua, WI');
    expect(result!.acreage).toBe(60);
  });

  it('parses comma-formatted string prices in ld+json offers', () => {
    // Bug this catches: parseFloat("1,250,000") === 1 — the listing would be
    // created with price $1 and the truthy value blocks the DOM fallback
    const url = 'https://www.landwatch.com/land/pid/999999';

    document.body.innerHTML = `
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'Product',
        name: '300 acres in Grant County',
        address: { addressLocality: 'Lancaster', addressRegion: 'WI' },
        offers: { price: '1,250,000' },
      })}</script>
    `;

    const result = landwatchExtractor.extract(document, url);
    expect(result!.price).toBe(1250000);
  });

  it('reads the price from an offers array', () => {
    const url = 'https://www.landwatch.com/land/pid/101010';

    document.body.innerHTML = `
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'Product',
        name: '80 acres in Iowa County',
        address: { addressLocality: 'Dodgeville', addressRegion: 'WI' },
        offers: [{ '@type': 'Offer', price: 320000 }],
      })}</script>
    `;

    const result = landwatchExtractor.extract(document, url);
    expect(result!.price).toBe(320000);
  });

  it('handles malformed ld+json gracefully without crashing', () => {
    const url = 'https://www.landwatch.com/tx-land/44556677';

    document.body.innerHTML = `
      <script type="application/ld+json">{ not valid json }</script>
      <div class="property-address">Fallback Address, TX 75001</div>
    `;

    // Should not throw, and should fall back to DOM
    const result = landwatchExtractor.extract(document, url);
    expect(result).not.toBeNull();
    expect(result!.address).toBe('Fallback Address, TX 75001');
  });

  it('extracts acreage from text with commas and varying formats', () => {
    const url = 'https://www.landwatch.com/mt-land/99001122';

    document.body.innerHTML = `
      <div class="property-address">Rural Route, MT 59001</div>
      <dd>1,200.5 acres available</dd>
    `;

    const result = landwatchExtractor.extract(document, url);
    expect(result!.acreage).toBe(1200.5);
  });
});
