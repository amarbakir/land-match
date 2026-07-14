export interface RateLimitWindow {
  count: number;
  resetAt: number; // epoch ms
}

export interface RateLimitStore {
  /** Record one hit against the key, opening a fresh window if the current one expired. */
  increment(key: string, windowMs: number): Promise<RateLimitWindow>;
  /** Return one hit to the key's live window (floored at 0; no-op if the
   *  window is missing or expired). Required: a store that silently lacked
   *  refunds would leak summary budget on every failed generation. */
  decrement(key: string): Promise<void>;
}

// Sweep expired entries once the map grows past this size, so long-running
// processes don't accumulate one entry per client IP forever.
const SWEEP_THRESHOLD = 10_000;

/** Per-process store. Fine for a single instance and unit tests; horizontally
 *  scaled deployments must use a shared store or limits multiply per instance. */
export class InMemoryRateLimitStore implements RateLimitStore {
  private windows = new Map<string, RateLimitWindow>();

  async increment(key: string, windowMs: number): Promise<RateLimitWindow> {
    const now = Date.now();

    let entry = this.windows.get(key);
    if (!entry || now >= entry.resetAt) {
      if (this.windows.size >= SWEEP_THRESHOLD) {
        for (const [k, v] of this.windows) {
          if (now >= v.resetAt) this.windows.delete(k);
        }
      }
      entry = { count: 0, resetAt: now + windowMs };
      this.windows.set(key, entry);
    }

    entry.count++;
    return entry;
  }

  async decrement(key: string): Promise<void> {
    const entry = this.windows.get(key);
    if (entry && Date.now() < entry.resetAt && entry.count > 0) {
      entry.count--;
    }
  }
}
