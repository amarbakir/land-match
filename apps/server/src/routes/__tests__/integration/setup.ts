import { afterAll, beforeEach } from 'vitest';

import { pool } from '../../../db/client';
import { resetSharedRateLimitStore } from '../../../lib/sharedRateLimitStore';

// Child-first order so CASCADE has nothing to complain about; wipes all rows
// between tests so each one starts from a clean, isolated database state.
const TABLES = 'alerts, scores, enrichments, saved_listings, listings, search_profiles, refresh_tokens, users, rate_limits';

beforeEach(async () => {
  await pool.query(`TRUNCATE TABLE ${TABLES} RESTART IDENTITY CASCADE`);
  // The process-wide rate-limit store outlives createApp(); reset it to match
  // the wiped rate_limits table or auth tests 429 partway through a file.
  resetSharedRateLimitStore();
});

afterAll(async () => {
  await pool.end();
});
