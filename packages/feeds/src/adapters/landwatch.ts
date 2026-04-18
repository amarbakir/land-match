import RssParser from 'rss-parser';
import { ok, err, type Result } from '@landmatch/api';

import type { FeedAdapter, RawListing } from '../types';

interface LandWatchAdapterConfig {
  feedUrl: string;
}

const parser = new RssParser();

function extractPrice(text: string): number | undefined {
  const match = text.match(/\$[\d,]+/);
  if (!match) return undefined;
  return parseInt(match[0].replace(/[$,]/g, ''), 10) || undefined;
}

function extractAcreage(text: string): number | undefined {
  const match = text.match(/([\d.]+)\s*acres?/i);
  if (!match) return undefined;
  return parseFloat(match[1]) || undefined;
}

function extractCountyState(text: string): { county?: string; state?: string } {
  const match = text.match(/in\s+([A-Za-z\s]+?)\s+County,\s*([A-Z]{2})/i);
  if (!match) return {};
  return { county: `${match[1]} County`, state: match[2] };
}

export function createLandWatchAdapter(config: LandWatchAdapterConfig): FeedAdapter {
  return {
    name: 'landwatch',
    async fetchListings(): Promise<Result<RawListing[]>> {
      try {
        const response = await fetch(config.feedUrl);
        if (!response.ok) {
          return err(`LandWatch feed returned ${response.status}`);
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
            source: 'landwatch',
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
        return err(`LandWatch fetch failed: ${message}`);
      }
    },
  };
}
