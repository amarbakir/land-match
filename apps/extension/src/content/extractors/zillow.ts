import type { ListingExtractor, ExtractedListing } from './types';

// Matches Zillow property detail pages (e.g. /homedetails/21881-Kale-Rd-.../123456789_zpid/)
const DETAIL_URL_PATTERN = /^https:\/\/www\.zillow\.com\/homedetails\//;

const SQFT_PER_ACRE = 43560;

interface ZillowProperty {
  streetAddress?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  price?: number;
  listPrice?: number;
  lotSize?: number; // sqft
  lotAreaValue?: number;
  lotAreaUnits?: string;
}

// Zillow embeds listing data in __NEXT_DATA__, but the shape has changed
// across site revisions — probe known locations, newest first.
function findProperty(data: any): ZillowProperty | null {
  const pageProps = data?.props?.pageProps;
  if (!pageProps) return null;

  // Current: componentProps.gdpClientCache is a JSON *string* keyed by query
  // name, each value holding { property }
  const cacheRaw = pageProps.componentProps?.gdpClientCache;
  if (typeof cacheRaw === 'string') {
    try {
      const cache = JSON.parse(cacheRaw);
      for (const entry of Object.values<any>(cache)) {
        if (entry?.property) return entry.property;
      }
    } catch {
      // Malformed cache, try older shapes
    }
  }

  return pageProps.initialReduxState?.gdp?.building ?? pageProps.property ?? null;
}

function toAcres(property: ZillowProperty): number | undefined {
  if (property.lotAreaValue) {
    return /acre/i.test(property.lotAreaUnits ?? '')
      ? property.lotAreaValue
      : property.lotAreaValue / SQFT_PER_ACRE;
  }
  if (property.lotSize) return property.lotSize / SQFT_PER_ACRE;
  return undefined;
}

function extractFromNextData(doc: Document): Partial<ExtractedListing> | null {
  const script = doc.getElementById('__NEXT_DATA__');
  if (!script?.textContent) return null;

  let property: ZillowProperty | null;
  try {
    property = findProperty(JSON.parse(script.textContent));
  } catch {
    return null;
  }
  if (!property) return null;

  const addressParts = [
    property.streetAddress,
    property.city,
    property.state,
    property.zipcode,
  ].filter(Boolean);

  return {
    address: addressParts.length > 0 ? addressParts.join(', ') : undefined,
    title: property.streetAddress,
    price: property.price ?? property.listPrice,
    acreage: toAcres(property),
  };
}

function extractFromDOM(doc: Document): Partial<ExtractedListing> {
  const result: Partial<ExtractedListing> = {};

  // Zillow's h1 is the street address; require a state+zip pattern so an
  // error/interstitial heading is never geocoded
  const h1Text = doc.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim();
  if (h1Text && /\b[A-Z]{2}\s+\d{5}/.test(h1Text)) {
    result.address = h1Text;
  }

  const priceText =
    doc.querySelector('[data-testid="price"]')?.textContent ??
    doc.querySelector('[data-testid="bdp-price"]')?.textContent;
  if (priceText) {
    const digits = priceText.replace(/[^0-9.]/g, '');
    if (digits) result.price = parseFloat(digits);
  }

  return result;
}

function extractZpid(url: string): string | undefined {
  return url.match(/\/(\d+)_zpid/)?.[1];
}

export const zillowExtractor: ListingExtractor = {
  name: 'zillow',

  matches(url: string): boolean {
    return DETAIL_URL_PATTERN.test(url);
  },

  extract(doc: Document): ExtractedListing | null {
    const nextData = extractFromNextData(doc) ?? {};
    const dom = extractFromDOM(doc);
    // Structured data takes priority, but must not erase DOM values with
    // fields it doesn't have
    const defined = Object.fromEntries(
      Object.entries(nextData).filter(([, v]) => v !== undefined),
    );
    const merged: Partial<ExtractedListing> = { ...dom, ...defined };

    if (!merged.address) return null;

    return {
      address: merged.address,
      price: merged.price,
      acreage: merged.acreage,
      title: merged.title,
      url: window.location.href,
      source: 'zillow',
      externalId: extractZpid(window.location.href),
    };
  },
};
