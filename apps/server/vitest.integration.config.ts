import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    globalSetup: ['src/routes/__tests__/integration/globalSetup.ts'],
    setupFiles: ['src/routes/__tests__/integration/setup.ts'],
    // Point the app's DB client at the dedicated test database (see globalSetup).
    // Set here so it is in process.env before config.ts reads it at import time.
    env: {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/landmatch_test',
      DIRECT_URL: 'postgresql://postgres:postgres@localhost:5432/landmatch_test',
    },
    testTimeout: 30_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@landmatch/db': path.resolve(__dirname, '../../packages/db/src'),
    },
  },
});
