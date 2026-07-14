import type { ListingExtractor, ExtractedListing } from './types';
import { extractListingFromLdJson } from './ld-json';
import { extractTrailingId, parseAcreage, parsePrice, US_STATE_ZIP_PATTERN } from './parse';

// Matches LandWatch listing detail pages (e.g. /property/land-for-sale-...-/12345678)
const DETAIL_URL_PATTERN = /^https:\/\/www\.landwatch\.com\/.*\/\d+$/;

function extractFromDOM(doc: Document): Partial<ExtractedListing> {
  const result: Partial<ExtractedListing> = {};

  // On LandWatch, the h1 typically contains the street address + city/state/zip
  // e.g. "21881 Kale Road , Sparta, WI 54656(Monroe County)"
  const h1 = doc.querySelector('h1');
  if (h1?.textContent) {
    const h1Text = h1.textContent.trim();
    // If h1 looks like an address (contains a US state abbreviation + zip), use as address
    if (US_STATE_ZIP_PATTERN.test(h1Text)) {
      // Clean up formatting: "Sparta, WI 54656(Monroe County)" → "Sparta, WI 54656"
      result.address = h1Text.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
    } else {
      result.title = h1Text;
    }
  }

  // Explicit address elements (fallback)
  if (!result.address) {
    const addressEl =
      doc.querySelector('[data-testid="listing-address"]') ??
      doc.querySelector('.property-address') ??
      doc.querySelector('[class*="address"]');
    if (addressEl?.textContent) result.address = addressEl.textContent.trim();
  }

  // Price
  const priceEl =
    doc.querySelector('[data-testid="listing-price"]') ??
    doc.querySelector('.property-price') ??
    doc.querySelector('[class*="price"]');
  const price = parsePrice(priceEl?.textContent);
  if (price) result.price = price;

  // Acreage — look for acreage in details
  const detailEls = doc.querySelectorAll('[class*="detail"], [class*="attribute"], dt, dd');
  for (const el of detailEls) {
    const acreage = parseAcreage(el.textContent);
    if (acreage) {
      result.acreage = acreage;
      break;
    }
  }

  return result;
}

export const landwatchExtractor: ListingExtractor = {
  name: 'landwatch',

  matches(url: string): boolean {
    return DETAIL_URL_PATTERN.test(url);
  },

  extract(doc: Document, url: string): ExtractedListing | null {
    // Try structured data first, then fall back to DOM scraping
    const ldJson = extractListingFromLdJson(doc);
    const dom = extractFromDOM(doc);
    const merged = { ...dom, ...ldJson }; // ld+json takes priority

    if (!merged.address) return null;

    return {
      address: merged.address,
      price: merged.price,
      acreage: merged.acreage,
      title: merged.title,
      url,
      source: 'landwatch',
      externalId: extractTrailingId(url),
    };
  },

};
