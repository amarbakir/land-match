/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { craigslistExtractor } from '../content/extractors/craigslist';

describe('craigslistExtractor.matches', () => {
  it('matches real-estate posting URLs (by owner and by broker)', () => {
    expect(
      craigslistExtractor.matches('https://sfbay.craigslist.org/pen/reo/d/redwood-city-vacant-lot/7789012345.html'),
    ).toBe(true);
    expect(
      craigslistExtractor.matches('https://madison.craigslist.org/reb/d/sparta-hunting-land/7712345678.html'),
    ).toBe(true);
  });

  it('matches farm+garden posting URLs', () => {
    expect(
      craigslistExtractor.matches('https://vermont.craigslist.org/grd/d/stowe-small-farm/7723456789.html'),
    ).toBe(true);
  });

  it('rejects search/browse pages', () => {
    expect(craigslistExtractor.matches('https://sfbay.craigslist.org/search/rea')).toBe(false);
  });

  it('rejects postings in unrelated categories', () => {
    expect(
      craigslistExtractor.matches('https://sfbay.craigslist.org/pen/cto/d/honda-civic/7734567890.html'),
    ).toBe(false);
  });

  it('rejects non-Craigslist URLs', () => {
    expect(craigslistExtractor.matches('https://www.landwatch.com/land/reo/12345678')).toBe(false);
  });
});

describe('craigslistExtractor.extract', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('extracts title, price, acreage, and mapaddress', () => {
    const url = 'https://madison.craigslist.org/reo/d/sparta-hunting-land/7712345678.html';

    document.body.innerHTML = `
      <span id="titletextonly">40 acres hunting land near Sparta</span>
      <span class="price">$120,000</span>
      <div class="mapaddress">21881 Kale Rd, Sparta, WI 54656</div>
      <section id="postingbody">Beautiful wooded parcel with creek frontage.</section>
    `;

    const result = craigslistExtractor.extract(document, url);

    expect(result).not.toBeNull();
    expect(result!.title).toBe('40 acres hunting land near Sparta');
    expect(result!.price).toBe(120000);
    expect(result!.acreage).toBe(40);
    expect(result!.address).toBe('21881 Kale Rd, Sparta, WI 54656');
    expect(result!.source).toBe('craigslist');
    expect(result!.externalId).toBe('7712345678');
    expect(result!.url).toBe(url);
  });

  it('falls back to a street address found in the posting body', () => {
    const url = 'https://vermont.craigslist.org/grd/d/stowe-small-farm/7723456789.html';

    document.body.innerHTML = `
      <span id="titletextonly">Small farm for sale</span>
      <section id="postingbody">
        Come see this working homestead at 123 Farm Lane, Stowe, VT 05672.
        Includes 12.5 acres of pasture and a year-round spring.
      </section>
    `;

    const result = craigslistExtractor.extract(document, url);

    expect(result).not.toBeNull();
    expect(result!.address).toBe('123 Farm Lane, Stowe, VT 05672');
    // Acreage lives in the body, not the title
    expect(result!.acreage).toBe(12.5);
    // No price element → undefined, not NaN or 0
    expect(result!.price).toBeUndefined();
  });

  it('returns null when no address can be found', () => {
    // Bug this catches: Craigslist posts routinely omit addresses; pushing
    // an address-less enrichment request fails server geocoding and burns quota
    const url = 'https://sfbay.craigslist.org/pen/reo/d/mystery-land/7745678901.html';

    document.body.innerHTML = `
      <span id="titletextonly">Nice land, call for details</span>
      <section id="postingbody">Great opportunity! Serious inquiries only.</section>
    `;

    expect(craigslistExtractor.extract(document, url)).toBeNull();
  });

  it('ignores an acreage-like number in an unrelated context over a real one', () => {
    const url = 'https://madison.craigslist.org/reo/d/land/7756789012.html';

    document.body.innerHTML = `
      <span id="titletextonly">Land with road frontage</span>
      <div class="mapaddress">456 Valley View, Boise, ID 83702</div>
      <section id="postingbody">Parcel is 10 acres. Priced to sell.</section>
    `;

    const result = craigslistExtractor.extract(document, url);
    expect(result!.acreage).toBe(10);
  });
});
