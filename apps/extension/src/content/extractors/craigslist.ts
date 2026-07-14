import type { ListingExtractor, ExtractedListing } from './types';
import { parseAcreage, parsePrice } from './parse';

// Matches Craigslist posting pages in land-relevant categories:
// real estate (rea/reo/reb) and farm+garden (grd/grq/grp), e.g.
// https://sfbay.craigslist.org/pen/reo/d/redwood-city-vacant-lot/7789012345.html
const POSTING_URL_PATTERN =
  /^https:\/\/[^/]+\.craigslist\.org\/(?:[^/]+\/)*(?:rea|reo|reb|grd|grq|grp)\/(?:[^/]+\/)*\d+\.html/;

// Street address like "123 Farm Lane, Stowe, VT 05672" inside free-form text.
// Quantifiers are bounded so a long address-less posting body can't trigger
// pathological backtracking.
const ADDRESS_PATTERN =
  /(\d+\s+[\w ]{1,60}(?:Road|Rd|Street|St|Avenue|Ave|Drive|Dr|Lane|Ln|Way|Highway|Hwy)[^,\n]{0,40},\s*\w+(?:\s+\w+){0,3},?\s*[A-Z]{2}\s*\d{5})/i;

function extractBodyAddress(bodyText: string): string | undefined {
  const match = bodyText.match(ADDRESS_PATTERN)?.[1]?.trim();
  // Re-check the state+zip tail case-sensitively — the /i needed for street
  // suffixes would otherwise accept any two letters as a "state"
  return match && /[A-Z]{2}\s*\d{5}$/.test(match) ? match : undefined;
}

export const craigslistExtractor: ListingExtractor = {
  name: 'craigslist',

  matches(url: string): boolean {
    return POSTING_URL_PATTERN.test(url);
  },

  extract(doc: Document, url: string): ExtractedListing | null {
    const title = doc.getElementById('titletextonly')?.textContent?.trim();
    const bodyText = doc.getElementById('postingbody')?.textContent ?? '';

    // Craigslist has no structured data — the map address block is the most
    // reliable source, then a street-address pattern in the posting body.
    // Postings can render several .mapaddress elements (one holds only the
    // "(google map)" link) and empty ones, so filter rather than take first.
    const mapAddress = Array.from(doc.querySelectorAll('.mapaddress'))
      .map((el) => el.textContent?.trim() ?? '')
      .find((text) => text && !/google map/i.test(text));
    const address = mapAddress || extractBodyAddress(bodyText);

    if (!address) return null;

    return {
      address,
      price: parsePrice(doc.querySelector('.price')?.textContent),
      acreage: parseAcreage(title) ?? parseAcreage(bodyText),
      title,
      url,
      source: 'craigslist',
      externalId: url.match(/(\d+)\.html/)?.[1],
    };
  },
};
