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

  it('parses hyphenated acreage like "12.4-Acre" in the title', () => {
    // Seen on a real Vermont posting: "12.4-Acre Building Lot Near Lake
    // Bomoseen". Bug this catches: \s* between number and "acre" misses the
    // hyphenated form, silently dropping lot size
    const url = 'https://vermont.craigslist.org/reo/d/bomoseen-lot/7731604351.html';

    document.body.innerHTML = `
      <span id="titletextonly">12.4-Acre Building Lot Near Lake Bomoseen</span>
      <div class="mapaddress">North Road</div>
      <section id="postingbody">Quiet back road near the lake.</section>
    `;

    const result = craigslistExtractor.extract(document, url);
    expect(result!.acreage).toBe(12.4);
  });

  it('treats the "$0" call-for-price placeholder as no price', () => {
    // Bug this catches: price 0 fails the server's z.number().positive()
    // validation and the whole enrich request 400s
    const url = 'https://madison.craigslist.org/reo/d/land/7756789013.html';

    document.body.innerHTML = `
      <span id="titletextonly">Land, call for price</span>
      <span class="price">$0</span>
      <div class="mapaddress">456 Valley View, Boise, ID 83702</div>
      <section id="postingbody">Call me.</section>
    `;

    const result = craigslistExtractor.extract(document, url);
    expect(result).not.toBeNull();
    expect(result!.price).toBeUndefined();
  });

  it('does not mistake lowercase prose for a street address', () => {
    // Bug this catches: /i on the state abbreviation lets any two letters
    // pass as a state, so directions prose gets geocoded as an address
    const url = 'https://madison.craigslist.org/reo/d/land/7756789014.html';

    document.body.innerHTML = `
      <span id="titletextonly">Remote parcel</span>
      <section id="postingbody">just 2 miles down the highway, turn at mile 12345 and follow the signs</section>
    `;

    expect(craigslistExtractor.extract(document, url)).toBeNull();
  });

  it('skips a punctuation-only acreage match instead of returning NaN', () => {
    // Bug this catches: "land. Acres" captures "." → parseFloat NaN, which is
    // not nullish, so the ?? chain never scans the body for the real value
    const url = 'https://madison.craigslist.org/reo/d/land/7756789015.html';

    document.body.innerHTML = `
      <span id="titletextonly">Beautiful land. Acres of privacy</span>
      <div class="mapaddress">456 Valley View, Boise, ID 83702</div>
      <section id="postingbody">40 acres of pasture with fencing.</section>
    `;

    const result = craigslistExtractor.extract(document, url);
    expect(result!.acreage).toBe(40);
  });

  it('does not read "2 AC units" as 2 acres, but still parses lowercase "40 ac"', () => {
    const url = 'https://madison.craigslist.org/reo/d/land/7756789016.html';

    document.body.innerHTML = `
      <span id="titletextonly">Country home</span>
      <div class="mapaddress">456 Valley View, Boise, ID 83702</div>
      <section id="postingbody">Includes 2 AC units and a shed.</section>
    `;
    expect(craigslistExtractor.extract(document, url)!.acreage).toBeUndefined();

    document.body.innerHTML = `
      <span id="titletextonly">Country land</span>
      <div class="mapaddress">456 Valley View, Boise, ID 83702</div>
      <section id="postingbody">40 ac parcel with road frontage.</section>
    `;
    expect(craigslistExtractor.extract(document, url)!.acreage).toBe(40);
  });

  it('falls back to the body address when .mapaddress is present but empty', () => {
    const url = 'https://vermont.craigslist.org/grd/d/farm/7723456790.html';

    document.body.innerHTML = `
      <span id="titletextonly">Small farm</span>
      <div class="mapaddress">   </div>
      <section id="postingbody">Visit us at 123 Farm Lane, Stowe, VT 05672 anytime.</section>
    `;

    const result = craigslistExtractor.extract(document, url);
    expect(result).not.toBeNull();
    expect(result!.address).toBe('123 Farm Lane, Stowe, VT 05672');
  });

  it('skips a "(google map)" link block in favor of the real mapaddress', () => {
    // Real postings render both a p.mapaddress holding only the map link and
    // the actual address block
    const url = 'https://madison.craigslist.org/reo/d/land/7756789017.html';

    document.body.innerHTML = `
      <span id="titletextonly">Hunting land</span>
      <p class="mapaddress">(google map)</p>
      <div class="mapaddress">21881 Kale Rd, Sparta, WI 54656</div>
      <section id="postingbody">Wooded parcel.</section>
    `;

    const result = craigslistExtractor.extract(document, url);
    expect(result!.address).toBe('21881 Kale Rd, Sparta, WI 54656');
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
