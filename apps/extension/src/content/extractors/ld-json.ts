import type { ExtractedListing } from './types';
import { joinAddressParts, parseAcreage, parsePrice } from './parse';

const LISTING_TYPES = new Set([
  'Product', 'RealEstateListing', 'SingleFamilyResidence',
  'Residence', 'House', 'LandForm',
]);

function hasListingType(type: unknown): boolean {
  if (typeof type === 'string') return LISTING_TYPES.has(type);
  if (Array.isArray(type)) return type.some((t) => LISTING_TYPES.has(t));
  return false;
}

function extractAddress(data: Record<string, any>): string | undefined {
  // Try direct address, then mainEntity.address, then contentLocation.address
  const addr = data.address ?? data.mainEntity?.address ?? data.contentLocation?.address;
  if (!addr) return undefined;

  return joinAddressParts(
    addr.streetAddress,
    addr.addressLocality,
    addr.addressRegion,
    addr.postalCode,
  );
}

function isComplete(result: Partial<ExtractedListing>): boolean {
  return Boolean(result.title && result.address && result.price && result.acreage);
}

/**
 * Pull listing fields from the document's ld+json blocks, merging across
 * blocks (first value wins per field). Handles both single-object and
 * top-level-array blocks. Never sets a key to undefined, so the result is
 * safe to spread over DOM-scraped fallbacks.
 */
export function extractListingFromLdJson(doc: Document): Partial<ExtractedListing> {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  const result: Partial<ExtractedListing> = {};

  for (const script of scripts) {
    if (isComplete(result)) break;

    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent ?? '');
    } catch {
      continue; // Invalid JSON, skip
    }

    for (const data of Array.isArray(parsed) ? parsed : [parsed]) {
      try {
        if (!data || !hasListingType(data['@type'])) continue;

        const name = typeof data.name === 'string' ? data.name : undefined;
        const description = typeof data.description === 'string' ? data.description : undefined;

        if (name && !result.title) result.title = name;
        if (!result.address) {
          const address = extractAddress(data);
          if (address) result.address = address;
        }
        if (!result.price) {
          // offers may be a single Offer or an array; price may be a
          // comma-formatted string ("1,250,000"), which parseFloat mangles
          const offer = Array.isArray(data.offers) ? data.offers[0] : data.offers;
          const price = offer?.price != null ? parsePrice(String(offer.price)) : undefined;
          if (price) result.price = price;
        }
        if (!result.acreage) {
          // Acreage is rarely a structured field — scan name then description,
          // e.g. "157 acres in Monroe County"
          const acreage = parseAcreage(name) ?? parseAcreage(description);
          if (acreage) result.acreage = acreage;
        }
      } catch {
        // Structurally unexpected block (e.g. non-string fields) — skip it
      }
    }
  }

  return result;
}
