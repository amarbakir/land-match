import type { ListingExtractor, ExtractedListing } from './types';
import { extractListingFromLdJson } from './ld-json';

// Matches LandFlip land detail pages (e.g. /land/tennessee-farm-for-sale/338266)
const DETAIL_URL_PATTERN = /^https:\/\/(www\.)?landflip\.com\/land\//;

export const landflipExtractor: ListingExtractor = {
  name: 'landflip',

  matches(url: string): boolean {
    return DETAIL_URL_PATTERN.test(url);
  },

  extract(doc: Document): ExtractedListing | null {
    const listing = extractListingFromLdJson(doc);
    if (!listing?.address) return null;

    return {
      address: listing.address,
      price: listing.price,
      acreage: listing.acreage,
      title: listing.title,
      url: window.location.href,
      source: 'landflip',
      externalId: window.location.href.match(/\/(\d+)$/)?.[1],
    };
  },
};
