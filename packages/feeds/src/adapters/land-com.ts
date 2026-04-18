import type { FeedAdapter } from '../types';
import { createRssAdapter } from './rss';

interface LandComAdapterConfig {
  feedUrl: string;
}

export function createLandComAdapter(config: LandComAdapterConfig): FeedAdapter {
  return createRssAdapter({ name: 'land.com', feedUrl: config.feedUrl });
}
