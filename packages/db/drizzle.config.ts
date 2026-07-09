import dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';

import { parseDatabaseUrl } from './src/connection';

dotenv.config({ path: '../../apps/server/.env' });

// Shared TLS policy from src/connection.ts — a raw URL uses pg-native
// semantics (plaintext without sslmode; sslmode=require unverified), so the
// same URL would give drizzle-kit a weaker connection than the server.
const { warnings, ssl, ...connection } = parseDatabaseUrl(
  process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/landmatch',
);
for (const warning of warnings) console.warn(`[drizzle-kit] ${warning}`);

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: {
    host: connection.host,
    port: connection.port,
    user: connection.user,
    password: connection.password,
    database: connection.database,
    ssl: ssl ?? false,
  },
});
