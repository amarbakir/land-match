import type { ListingExtractor, ExtractedListing } from './types';

// Matches LandWatch listing detail pages (e.g. /property/land-for-sale-...-/12345678)
const DETAIL_URL_PATTERN = /^https:\/\/www\.landwatch\.com\/.*\/\d+$/;

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

function extractFromLdJson(doc: Document): Partial<ExtractedListing> | null {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  const result: Partial<ExtractedListing> = {};

  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent ?? '');
      if (!hasListingType(data['@type'])) continue;

      if (data.name && !result.title) result.title = data.name;
      if (!result.address) result.address = extractAddress(data);
      if (!result.price && data.offers?.price) result.price = parseFloat(data.offers.price);
      if (!result.acreage) {
        // Try to extract acreage from name like "157 acres in Monroe County"
        const acreMatch = (data.name ?? '').match(/([\d,.]+)\s*acres?/i);
        if (acreMatch) result.acreage = parseFloat(acreMatch[1].replace(/,/g, ''));
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

function extractFromDOM(doc: Document): Partial<ExtractedListing> {
  const result: Partial<ExtractedListing> = {};

  // On LandWatch, the h1 typically contains the street address + city/state/zip
  // e.g. "21881 Kale Road , Sparta, WI 54656(Monroe County)"
  const h1 = doc.querySelector('h1');
  if (h1?.textContent) {
    const h1Text = h1.textContent.trim();
    // If h1 looks like an address (contains a US state abbreviation + zip), use as address
    if (/\b[A-Z]{2}\s+\d{5}/.test(h1Text)) {
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
  if (priceEl?.textContent) {
    const priceMatch = priceEl.textContent.replace(/[^0-9.]/g, '');
    if (priceMatch) result.price = parseFloat(priceMatch);
  }

  // Acreage — look for acreage in details
  const detailEls = doc.querySelectorAll('[class*="detail"], [class*="attribute"], dt, dd');
  for (const el of detailEls) {
    const text = el.textContent?.toLowerCase() ?? '';
    const acreMatch = text.match(/([\d,.]+)\s*(?:acres?|ac)/);
    if (acreMatch) {
      result.acreage = parseFloat(acreMatch[1].replace(/,/g, ''));
      break;
    }
  }

  return result;
}

function extractExternalId(url: string): string | undefined {
  const match = url.match(/\/(\d+)$/);
  return match?.[1];
}

export const landwatchExtractor: ListingExtractor = {
  name: 'landwatch',

  matches(url: string): boolean {
    return DETAIL_URL_PATTERN.test(url);
  },

  extract(doc: Document): ExtractedListing | null {
    // Try structured data first, then fall back to DOM scraping
    const ldJson = extractFromLdJson(doc);
    const dom = extractFromDOM(doc);
    const merged = { ...dom, ...ldJson }; // ld+json takes priority

    if (!merged.address) return null;

    return {
      address: merged.address,
      price: merged.price,
      acreage: merged.acreage,
      title: merged.title,
      url: window.location.href,
      source: 'landwatch',
      externalId: extractExternalId(window.location.href),
    };
  },

  getOverlayAnchor(doc: Document): Element | null {
    // Insert after the main listing header/gallery area
    return (
      doc.querySelector('[data-testid="listing-details"]') ??
      doc.querySelector('.property-details') ??
      doc.querySelector('[class*="gallery"]') ??
      doc.querySelector('h1')?.parentElement ??
      null
    );
  },
};
