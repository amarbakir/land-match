import type { FeedAdapter } from '../types';
import { createRssAdapter } from './rss';

interface LandWatchAdapterConfig {
  feedUrl: string;
}

export function createLandWatchAdapter(config: LandWatchAdapterConfig): FeedAdapter {
  return createRssAdapter({ name: 'landwatch', feedUrl: config.feedUrl });
}
