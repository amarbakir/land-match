import { server } from '../config';

import { InMemoryRateLimitStore, type RateLimitStore } from './rateLimitStore';
import { PostgresRateLimitStore } from './postgresRateLimitStore';

let store: RateLimitStore | undefined;

// One store per process, shared by the middleware limiters (app.ts) and the
// LLM summary budget: the Postgres store sweeps expired rows inline on its
// own interval, so a second instance just doubles the sweep DELETEs without
// adding anything — all real state lives in the rate_limits table. Keys are
// scope-prefixed, so sharing cannot cross-count.
export function getSharedRateLimitStore(): RateLimitStore {
  store ??= server.rateLimitStore === 'postgres'
    ? new PostgresRateLimitStore()
    : new InMemoryRateLimitStore();
  return store;
}
