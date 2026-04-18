import type { FeedAdapter, FeedIngestionResult, RawListing } from './types';

export async function runFeedIngestion(adapters: FeedAdapter[]): Promise<FeedIngestionResult> {
  const listings: RawListing[] = [];
  const errors: FeedIngestionResult['errors'] = [];

  const results = await Promise.allSettled(
    adapters.map(async (adapter) => {
      try {
        const result = await adapter.fetchListings();
        return { adapter: adapter.name, result };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { adapter: adapter.name, result: { ok: false as const, error: message } };
      }
    }),
  );

  for (const settled of results) {
    if (settled.status === 'rejected') continue;

    const { adapter, result } = settled.value;
    if (result.ok) {
      listings.push(...result.data);
    } else {
      errors.push({ adapter, error: result.error });
    }
  }

  return { listings, errors };
}
