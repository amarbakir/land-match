/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { zillowExtractor } from '../content/extractors/zillow';

function nextDataScript(data: unknown): string {
  return `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`;
}

describe('zillowExtractor.matches', () => {
  it('matches Zillow homedetails pages', () => {
    expect(
      zillowExtractor.matches('https://www.zillow.com/homedetails/21881-Kale-Rd-Sparta-WI-54656/123456789_zpid/'),
    ).toBe(true);
  });

  it('rejects Zillow search/browse pages', () => {
    expect(zillowExtractor.matches('https://www.zillow.com/sparta-wi/land/')).toBe(false);
  });

  it('rejects non-Zillow URLs', () => {
    expect(zillowExtractor.matches('https://www.landwatch.com/land/some-slug/12345678')).toBe(false);
  });
});

describe('zillowExtractor.extract', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('extracts address, price, and acreage from __NEXT_DATA__ redux state', () => {
    const url = 'https://www.zillow.com/homedetails/21881-Kale-Rd-Sparta-WI-54656/123456789_zpid/';

    document.body.innerHTML = nextDataScript({
      props: {
        pageProps: {
          initialReduxState: {
            gdp: {
              building: {
                streetAddress: '21881 Kale Rd',
                city: 'Sparta',
                state: 'WI',
                zipcode: '54656',
                price: 495000,
                lotSize: 87120, // sqft — must convert to 2 acres
              },
            },
          },
        },
      },
    });

    const result = zillowExtractor.extract(document, url);

    expect(result).not.toBeNull();
    expect(result!.address).toBe('21881 Kale Rd, Sparta, WI, 54656');
    expect(result!.price).toBe(495000);
    // Bug this catches: passing raw sqft as acreage inflates lot size 43560x
    // and the scoring engine scores a 2-acre lot as an 87k-acre ranch
    expect(result!.acreage).toBe(2);
    expect(result!.source).toBe('zillow');
    expect(result!.externalId).toBe('123456789');
    expect(result!.url).toBe(url);
  });

  it('extracts from gdpClientCache (JSON string) used by current Zillow pages', () => {
    const url = 'https://www.zillow.com/homedetails/456-Ridge-Ln-Boise-ID-83702/98765_zpid/';

    document.body.innerHTML = nextDataScript({
      props: {
        pageProps: {
          componentProps: {
            gdpClientCache: JSON.stringify({
              'ForSaleShopperPlatformFullRenderQuery{"zpid":98765}': {
                property: {
                  streetAddress: '456 Ridge Ln',
                  city: 'Boise',
                  state: 'ID',
                  zipcode: '83702',
                  price: 250000,
                  lotAreaValue: 10.5,
                  lotAreaUnits: 'acres',
                },
              },
            }),
          },
        },
      },
    });

    const result = zillowExtractor.extract(document, url);

    expect(result).not.toBeNull();
    expect(result!.address).toBe('456 Ridge Ln, Boise, ID, 83702');
    expect(result!.price).toBe(250000);
    // Bug this catches: treating lotAreaValue as sqft when units say acres
    expect(result!.acreage).toBe(10.5);
  });

  it('converts lotAreaValue to acres when its units are sqft', () => {
    const url = 'https://www.zillow.com/homedetails/1-A-St-Elko-NV-89801/11111_zpid/';

    document.body.innerHTML = nextDataScript({
      props: {
        pageProps: {
          property: {
            streetAddress: '1 A St',
            city: 'Elko',
            state: 'NV',
            zipcode: '89801',
            listPrice: 60000,
            lotAreaValue: 21780,
            lotAreaUnits: 'sqft',
          },
        },
      },
    });

    const result = zillowExtractor.extract(document, url);

    expect(result!.acreage).toBe(0.5);
    // listPrice fallback when price is absent
    expect(result!.price).toBe(60000);
  });

  it('falls back to DOM scraping when __NEXT_DATA__ is missing', () => {
    const url = 'https://www.zillow.com/homedetails/789-Meadow-Rd-Stowe-VT-05672/22222_zpid/';

    document.body.innerHTML = `
      <h1>789 Meadow Rd, Stowe, VT 05672</h1>
      <span data-testid="price">$325,000</span>
    `;

    const result = zillowExtractor.extract(document, url);

    expect(result).not.toBeNull();
    expect(result!.address).toBe('789 Meadow Rd, Stowe, VT 05672');
    expect(result!.price).toBe(325000);
  });

  it('falls back to DOM when __NEXT_DATA__ is malformed JSON', () => {
    const url = 'https://www.zillow.com/homedetails/5-Oak-Dr-Madison-WI-53703/33333_zpid/';

    document.body.innerHTML = `
      <script id="__NEXT_DATA__" type="application/json">{ not valid json</script>
      <h1>5 Oak Dr, Madison, WI 53703</h1>
    `;

    // Should not throw
    const result = zillowExtractor.extract(document, url);
    expect(result).not.toBeNull();
    expect(result!.address).toBe('5 Oak Dr, Madison, WI 53703');
  });

  it('keeps the DOM address when __NEXT_DATA__ has a property without address fields', () => {
    const url = 'https://www.zillow.com/homedetails/9-Pine-Ct-Sparta-WI-54656/66666_zpid/';

    document.body.innerHTML = `
      ${nextDataScript({
        props: { pageProps: { property: { price: 199000 } } },
      })}
      <h1>9 Pine Ct, Sparta, WI 54656</h1>
    `;

    const result = zillowExtractor.extract(document, url);

    // Bug this catches: letting structured data with no address override the
    // DOM result erases a perfectly good address
    expect(result).not.toBeNull();
    expect(result!.address).toBe('9 Pine Ct, Sparta, WI 54656');
    expect(result!.price).toBe(199000);
  });

  it('returns null when no address can be extracted', () => {
    // Bug this catches: enrichment requests without an address fail server
    // geocoding and burn quota
    const url = 'https://www.zillow.com/homedetails/44444_zpid/';
    document.body.innerHTML = '<div>Page is still loading…</div>';

    expect(zillowExtractor.extract(document, url)).toBeNull();
  });

  it('does not use an h1 that is not an address as the address', () => {
    const url = 'https://www.zillow.com/homedetails/55555_zpid/';
    document.body.innerHTML = '<h1>Access denied</h1>';

    // No state+zip pattern → not an address → null, not a bogus geocode
    expect(zillowExtractor.extract(document, url)).toBeNull();
  });
});
