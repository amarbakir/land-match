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

/** Test-only: wipe the in-memory windows so each test starts fresh. Clears
 *  in place (not just the pointer) because createApp() captures the instance
 *  in middleware closures — module-scope apps must see the wipe too. The
 *  postgres store needs no reset here; tests truncate rate_limits directly. */
export function resetSharedRateLimitStore(): void {
  if (store instanceof InMemoryRateLimitStore) store.clear();
  store = undefined;
}
