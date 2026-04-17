import dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';

dotenv.config({ path: '../../apps/server/.env' });

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/landmatch',
  },
});
