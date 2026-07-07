import path from 'path';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import * as schema from '@landmatch/db';

// Integration tests run against a dedicated database so they never touch the
// developer's dev data. The URL here must match vitest.integration.config.ts's
// test.env DATABASE_URL.
const TEST_DB = 'landmatch_test';
const ADMIN_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
const TEST_URL = `postgresql://postgres:postgres@localhost:5432/${TEST_DB}`;

// Runs once before the whole integration suite: (re)create the test database and
// bring its schema up to date by applying the committed Drizzle migrations.
export default async function globalSetup() {
  const admin = new Pool({ connectionString: ADMIN_URL });
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DB]);
    if (!rowCount) await admin.query(`CREATE DATABASE ${TEST_DB}`);
  } finally {
    await admin.end();
  }

  const pool = new Pool({ connectionString: TEST_URL });
  try {
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: path.resolve(process.cwd(), '../../packages/db/drizzle') });
  } finally {
    await pool.end();
  }
}
