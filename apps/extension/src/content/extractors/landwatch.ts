import type { ListingExtractor, ExtractedListing } from './types';

// Matches LandWatch listing detail pages (e.g. /property/land-for-sale-...-/12345678)
const DETAIL_URL_PATTERN = /^https:\/\/www\.landwatch\.com\/.*\/\d+$/;

function extractFromLdJson(doc: Document): Partial<ExtractedListing> | null {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent ?? '');

      // LandWatch uses Product or RealEstateListing structured data
      if (data['@type'] === 'Product' || data['@type'] === 'RealEstateListing') {
        const result: Partial<ExtractedListing> = {};

        if (data.name) result.title = data.name;

        // Address from structured data
        const address = data.address ?? data.contentLocation?.address;
        if (address) {
          const parts = [
            address.streetAddress,
            address.addressLocality,
            address.addressRegion,
            address.postalCode,
          ].filter(Boolean);
          if (parts.length > 0) result.address = parts.join(', ');
        }

        // Price from offers
        if (data.offers?.price) {
          result.price = parseFloat(data.offers.price);
        }

        return result;
      }
    } catch {
      // Invalid JSON, skip
    }
  }
  return null;
}

function extractFromDOM(doc: Document): Partial<ExtractedListing> {
  const result: Partial<ExtractedListing> = {};

  // Title
  const titleEl = doc.querySelector('h1');
  if (titleEl?.textContent) result.title = titleEl.textContent.trim();

  // Address — look for common LandWatch address containers
  const addressEl =
    doc.querySelector('[data-testid="listing-address"]') ??
    doc.querySelector('.property-address') ??
    doc.querySelector('[class*="address"]');
  if (addressEl?.textContent) result.address = addressEl.textContent.trim();

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
