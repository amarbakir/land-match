import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import path from 'path';
import { Pool } from 'pg';

import * as schema from '@landmatch/db';

import { database } from '../config';
import { logger } from '../lib/logger';

// Lambda containers each hold their own pool behind the Supabase pooler —
// keep them tiny so concurrent invocations don't exhaust pooler slots. The
// long-lived node server gets a normal-sized pool.
const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const poolMax = parseInt(process.env.DB_POOL_MAX || (isLambda ? '2' : '10'), 10);

export const pool = new Pool({
  ...database.connection,
  max: poolMax,
  // Fail acquisition fast when the DB is unreachable instead of hanging requests
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  // App queries are short; runaway statements must not pin a connection.
  // (Migrations run on their own pool below, without this cap.)
  statement_timeout: 30_000,
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
