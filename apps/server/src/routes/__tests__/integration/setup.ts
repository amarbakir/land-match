import { afterAll, beforeEach } from 'vitest';

import { pool } from '../../../db/client';

// Child-first order so CASCADE has nothing to complain about; wipes all rows
// between tests so each one starts from a clean, isolated database state.
const TABLES = 'alerts, scores, enrichments, saved_listings, listings, search_profiles, users';

beforeEach(async () => {
  await pool.query(`TRUNCATE TABLE ${TABLES} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await pool.end();
});
