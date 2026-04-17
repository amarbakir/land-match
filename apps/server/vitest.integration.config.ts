import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/routes/__tests__/integration/**/*.integration.test.ts', 'src/repos/__tests__/**/*.integration.test.ts'],
    setupFiles: ['src/routes/__tests__/integration/setup.ts'],
    testTimeout: 30_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@landmatch/db': path.resolve(__dirname, '../../packages/db/src'),
    },
  },
});
