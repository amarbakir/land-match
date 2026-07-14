export interface RateLimitWindow {
  count: number;
  resetAt: number; // epoch ms
}

export interface RateLimitStore {
  /** Record one hit against the key, opening a fresh window if the current one expired. */
  increment(key: string, windowMs: number): Promise<RateLimitWindow>;
  /** Return one hit to the window identified by `resetAt` (the value the
   *  consuming increment returned). Floored at 0; a no-op when that window
   *  has rolled over — refunding into a successor window would mint budget
   *  across days. Required: a store that silently lacked refunds would leak
   *  summary budget on every failed generation. */
  decrement(key: string, resetAt: number): Promise<void>;
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

  async decrement(key: string, resetAt: number): Promise<void> {
    const entry = this.windows.get(key);
    if (entry && entry.resetAt === resetAt && entry.count > 0) {
      entry.count--;
    }
  }

  /** Test-only: wipe all windows (mirrors truncating the rate_limits table). */
  clear(): void {
    this.windows.clear();
  }
}
