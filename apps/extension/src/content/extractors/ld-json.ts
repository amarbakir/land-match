import type { ExtractedListing } from './types';

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

  const parts = [
    addr.streetAddress,
    addr.addressLocality,
    addr.addressRegion,
    addr.postalCode,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

function parseAcreage(text: string): number | undefined {
  const match = text.match(/([\d,.]+)\s*acres?/i);
  return match ? parseFloat(match[1].replace(/,/g, '')) : undefined;
}

/**
 * Pull listing fields from all ld+json blocks in the document, merging across
 * blocks (first value wins per field). Handles both single-object and
 * top-level-array blocks.
 */
export function extractListingFromLdJson(doc: Document): Partial<ExtractedListing> | null {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  const result: Partial<ExtractedListing> = {};

  for (const script of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent ?? '');
    } catch {
      continue; // Invalid JSON, skip
    }

    for (const data of Array.isArray(parsed) ? parsed : [parsed]) {
      if (!data || !hasListingType(data['@type'])) continue;

      if (data.name && !result.title) result.title = data.name;
      if (!result.address) result.address = extractAddress(data);
      if (!result.price && data.offers?.price) result.price = parseFloat(data.offers.price);
      if (!result.acreage) {
        // Acreage is rarely a structured field — scan name then description,
        // e.g. "157 acres in Monroe County"
        result.acreage = parseAcreage(data.name ?? '') ?? parseAcreage(data.description ?? '');
      }
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}
