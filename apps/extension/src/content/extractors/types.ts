export interface ExtractedListing {
  address: string;
  price?: number;
  acreage?: number;
  title?: string;
  url: string;
  source: string;
  externalId?: string;
}

export interface ListingExtractor {
  name: string;
  matches(url: string): boolean;
  extract(document: Document): ExtractedListing | null;
  getOverlayAnchor(document: Document): Element | null;
}
