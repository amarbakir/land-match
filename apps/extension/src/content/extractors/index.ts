import type { ListingExtractor } from './types';
import { landwatchExtractor } from './landwatch';

const extractors: ListingExtractor[] = [landwatchExtractor];

export function findExtractor(url: string): ListingExtractor | null {
  return extractors.find((e) => e.matches(url)) ?? null;
}

export type { ExtractedListing, ListingExtractor } from './types';
