import { describe, expect, it } from 'vitest';

import { pool } from '../db/client';

describe('db pool', () => {
  it('survives an idle-client backend error instead of crashing the process', () => {
    // Bug this catches: node-postgres emits 'error' on the pool when an idle
    // client's backend dies (DB restart, failover, pgbouncer recycle). With no
    // listener, EventEmitter escalates it to an uncaught exception — the
    // whole server crashes because a connection it wasn't even using died.
    expect(() =>
      pool.emit('error', new Error('terminating connection due to administrator command')),
    ).not.toThrow();
  });

  it('bounds pool size and connection acquisition wait', () => {
    // Bug this catches: default pool config — unbounded acquisition waits hang
    // requests forever when the DB is unreachable, and an unsized pool
    // exhausts Supabase pooler slots under concurrency.
    expect(pool.options.max).toBeGreaterThan(0);
    expect(pool.options.connectionTimeoutMillis).toBeGreaterThan(0);
    expect(pool.options.idleTimeoutMillis).toBeGreaterThan(0);
  });
});
