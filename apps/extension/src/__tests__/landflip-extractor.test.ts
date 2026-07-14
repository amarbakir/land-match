/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { landflipExtractor } from '../content/extractors/landflip';

function ldJsonScript(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

describe('landflipExtractor.matches', () => {
  it('matches LandFlip land detail pages', () => {
    expect(landflipExtractor.matches('https://www.landflip.com/land/tennessee-farm-for-sale/338266')).toBe(true);
  });

  it('rejects LandFlip pages outside /land/', () => {
    expect(landflipExtractor.matches('https://www.landflip.com/sellers')).toBe(false);
  });

  it('rejects non-LandFlip URLs', () => {
    expect(landflipExtractor.matches('https://www.zillow.com/homedetails/1_zpid/')).toBe(false);
  });
});

describe('landflipExtractor.extract', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('extracts title, address, price, and acreage from JSON-LD', () => {
    const url = 'https://www.landflip.com/land/fentress-county-tn/338266';

    document.body.innerHTML = ldJsonScript({
      '@type': 'RealEstateListing',
      name: '40 Acres in Fentress County',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Jamestown',
        addressRegion: 'TN',
        postalCode: '38556',
      },
      offers: { price: '119900' },
    });

    const result = landflipExtractor.extract(document, url);

    expect(result).not.toBeNull();
    expect(result!.title).toBe('40 Acres in Fentress County');
    expect(result!.address).toBe('Jamestown, TN, 38556');
    expect(result!.price).toBe(119900);
    expect(result!.acreage).toBe(40);
    expect(result!.source).toBe('landflip');
    expect(result!.externalId).toBe('338266');
    expect(result!.url).toBe(url);
  });

  it('picks the listing out of array-form JSON-LD', () => {
    const url = 'https://www.landflip.com/land/ozark-mo/445566';

    document.body.innerHTML = ldJsonScript([
      { '@type': 'WebPage', name: 'LandFlip' },
      {
        '@type': 'Product',
        name: 'Ozark Retreat',
        address: { addressLocality: 'Ozark', addressRegion: 'MO' },
        offers: { price: 89000 },
      },
    ]);

    const result = landflipExtractor.extract(document, url);

    expect(result).not.toBeNull();
    expect(result!.address).toBe('Ozark, MO');
    expect(result!.price).toBe(89000);
  });

  it('falls back to description for acreage when the name has none', () => {
    const url = 'https://www.landflip.com/land/vt-meadow/778899';

    document.body.innerHTML = ldJsonScript({
      '@type': 'RealEstateListing',
      name: 'Secluded Vermont Meadow',
      description: 'A stunning 12.5 acre parcel with year-round stream access.',
      address: { addressLocality: 'Stowe', addressRegion: 'VT' },
    });

    const result = landflipExtractor.extract(document, url);

    // Bug this catches: only scanning the name for acreage loses lot size on
    // most LandFlip listings, and the scoring engine treats them as size-unknown
    expect(result!.acreage).toBe(12.5);
  });

  it('handles malformed JSON-LD gracefully and returns null', () => {
    const url = 'https://www.landflip.com/land/broken/111';

    document.body.innerHTML = '<script type="application/ld+json">{ nope</script>';

    expect(landflipExtractor.extract(document, url)).toBeNull();
  });

  it('returns null when JSON-LD has no address', () => {
    // Bug this catches: address-less enrichment requests fail server-side
    // geocoding and burn quota
    const url = 'https://www.landflip.com/land/no-address/222';

    document.body.innerHTML = ldJsonScript({
      '@type': 'RealEstateListing',
      name: 'Mystery Parcel',
    });

    expect(landflipExtractor.extract(document, url)).toBeNull();
  });
});
