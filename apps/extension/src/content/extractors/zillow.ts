import type { ListingExtractor, ExtractedListing } from './types';
import { joinAddressParts, parsePrice, US_STATE_ZIP_PATTERN } from './parse';

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

  return {
    address: joinAddressParts(
      property.streetAddress,
      property.city,
      property.state,
      property.zipcode,
    ),
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
  if (h1Text && US_STATE_ZIP_PATTERN.test(h1Text)) {
    result.address = h1Text;
  }

  result.price = parsePrice(
    doc.querySelector('[data-testid="price"]')?.textContent ??
      doc.querySelector('[data-testid="bdp-price"]')?.textContent,
  );

  return result;
}

export const zillowExtractor: ListingExtractor = {
  name: 'zillow',

  matches(url: string): boolean {
    return DETAIL_URL_PATTERN.test(url);
  },

  extract(doc: Document, url: string): ExtractedListing | null {
    const nextData = extractFromNextData(doc);
    // The DOM can only supply address and price — skip scraping it when the
    // structured data already has both
    const dom = nextData?.address && nextData.price ? {} : extractFromDOM(doc);

    const address = nextData?.address ?? dom.address;
    if (!address) return null;

    return {
      address,
      price: nextData?.price ?? dom.price,
      acreage: nextData?.acreage,
      title: nextData?.title,
      url,
      source: 'zillow',
      externalId: url.match(/\/(\d+)_zpid/)?.[1],
    };
  },
};
