import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import path from 'path';
import { Pool } from 'pg';

import * as schema from '@landmatch/db';

import { database } from '../config';
import { logger } from '../lib/logger';

export const pool = new Pool({
  ...database.connection,
  max: database.poolMax,
  // Fail acquisition fast when the DB is unreachable instead of hanging requests
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  // No statement_timeout here: pg sends it as a startup-packet parameter,
  // which transaction-mode poolers (Supabase Supavisor/pgbouncer) can reject —
  // turning a hardening flag into a full connection outage.
});

// node-postgres emits 'error' on the pool when an idle client's backend dies
// (DB restart, failover, pgbouncer recycle). Without a listener that becomes
// an uncaught exception and crashes the process — it's routine, just log it;
// the pool replaces the dead client on next acquisition.
pool.on('error', (err) => {
  logger.warn({ err }, 'idle db pool client errored — connection will be replaced');
});

export const db = drizzle(pool, { schema });

/**
 * Common base type for `db` and transaction objects (`tx`).
 * Use as an optional parameter in repo functions so they can
 * participate in service-level transactions:
 *
 *   export async function myQuery(arg: string, tx?: Tx) {
 *     return (tx ?? db).select()...
 *   }
 */
export type Tx = PgDatabase<NodePgQueryResultHKT, typeof schema>;

/**
 * Run database migrations to create/update tables
 * Should be called once during server startup
 */
export async function runMigrations() {
  try {
    const migrationPool = new Pool(database.directConnection);
    const migrationDb = drizzle(migrationPool, { schema });

    const migrationsFolder = path.resolve(__dirname, '../../../../packages/db/drizzle');
    logger.info({ migrationsFolder }, 'running database migrations');
    await migrate(migrationDb, { migrationsFolder });
    logger.info('database migrations completed');

    await migrationPool.end();
  } catch (error) {
    logger.error({ err: error }, 'database migrations failed');
    throw error;
  }
}
