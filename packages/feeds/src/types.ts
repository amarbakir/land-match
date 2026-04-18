import type { Result } from '@landmatch/api';

export interface FeedAdapter {
  name: string;
  fetchListings(): Promise<Result<RawListing[]>>;
}

export interface RawListing {
  externalId: string;
  source: string;
  url: string;
  title: string;
  description?: string;
  price?: number;
  acreage?: number;
  address?: string;
  city?: string;
  county?: string;
  state?: string;
  rawData: Record<string, unknown>;
}

export interface FeedIngestionResult {
  listings: RawListing[];
  errors: { adapter: string; error: string }[];
}
