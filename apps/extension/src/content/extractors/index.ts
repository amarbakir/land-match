import type { ListingExtractor } from './types';
import { landwatchExtractor } from './landwatch';
import { zillowExtractor } from './zillow';
import { landflipExtractor } from './landflip';
import { craigslistExtractor } from './craigslist';

const extractors: ListingExtractor[] = [
  landwatchExtractor,
  zillowExtractor,
  landflipExtractor,
  craigslistExtractor,
];

export function findExtractor(url: string): ListingExtractor | null {
  return extractors.find((e) => e.matches(url)) ?? null;
}

export type { ExtractedListing, ListingExtractor } from './types';
