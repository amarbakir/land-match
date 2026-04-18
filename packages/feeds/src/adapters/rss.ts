import RssParser from 'rss-parser';
import { ok, err, type Result } from '@landmatch/api';

import { extractPrice, extractAcreage, extractCountyState } from '../parsers';
import type { FeedAdapter, RawListing } from '../types';

interface RssAdapterConfig {
  name: string;
  feedUrl: string;
}

const parser = new RssParser();

export function createRssAdapter(config: RssAdapterConfig): FeedAdapter {
  return {
    name: config.name,
    async fetchListings(): Promise<Result<RawListing[]>> {
      try {
        const response = await fetch(config.feedUrl);
        if (!response.ok) {
          return err(`${config.name} feed returned ${response.status}`);
        }

        const xml = await response.text();
        const feed = await parser.parseString(xml);

        const listings: RawListing[] = feed.items.map((item) => {
          const description = item.contentSnippet || item.content || item.description || '';
          const title = item.title || '';
          const combinedText = `${title} ${description}`;
          const { county, state } = extractCountyState(combinedText);

          return {
            externalId: item.guid || item.link || '',
            source: config.name,
            url: item.link || '',
            title,
            description,
            price: extractPrice(combinedText),
            acreage: extractAcreage(combinedText),
            county,
            state,
            rawData: item as Record<string, unknown>,
          };
        });

        return ok(listings);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return err(`${config.name} fetch failed: ${message}`);
      }
    },
  };
}
