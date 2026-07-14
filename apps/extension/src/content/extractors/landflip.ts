import type { ListingExtractor, ExtractedListing } from './types';
import { extractListingFromLdJson } from './ld-json';
import { extractTrailingId, parseAcreage } from './parse';

// Matches LandFlip land detail pages (e.g. /land/411300)
const DETAIL_URL_PATTERN = /^https:\/\/(www\.)?landflip\.com\/land\//;

// Real FLIP-platform pages carry only BreadcrumbList JSON-LD (verified
// against archived FARMFLIP pages from 2026) — the listing itself lives in
// the DOM: an .address block, the h1 name, and acreage in the page
// title / meta description.
function extractFromDOM(doc: Document): Partial<ExtractedListing> {
  const result: Partial<ExtractedListing> = {};

  // First line only — the block nests "<p>street : city, ST zip</p>
  // <p>County, State</p>" and full textContent concatenates them without a
  // separator, poisoning geocoding
  const addressText = (
    doc.querySelector('.address p') ?? doc.querySelector('.address')
  )?.textContent?.trim();
  // Normalize the platform's "street : locality" separator for geocoding,
  // e.g. "948 Ford Road : Akron, AL 35441" → "948 Ford Road, Akron, AL 35441"
  if (addressText) result.address = addressText.replace(/\s*:\s*/g, ', ');

  const title = doc.querySelector('h1')?.textContent?.trim();
  if (title) result.title = title;

  const metaDescription = doc
    .querySelector('meta[name="description"]')
    ?.getAttribute('content');
  const acreage =
    parseAcreage(doc.querySelector('.acres')?.textContent) ??
    parseAcreage(doc.title) ??
    parseAcreage(metaDescription);
  if (acreage) result.acreage = acreage;

  return result;
}

export const landflipExtractor: ListingExtractor = {
  name: 'landflip',

  matches(url: string): boolean {
    return DETAIL_URL_PATTERN.test(url);
  },

  extract(doc: Document, url: string): ExtractedListing | null {
    // JSON-LD takes priority if the platform ever ships listing markup again
    const merged = { ...extractFromDOM(doc), ...extractListingFromLdJson(doc) };
    if (!merged.address) return null;

    return {
      address: merged.address,
      price: merged.price,
      acreage: merged.acreage,
      title: merged.title,
      url,
      source: 'landflip',
      externalId: extractTrailingId(url),
    };
  },
};
