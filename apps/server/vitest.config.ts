import path from 'path';
import { defineConfig } from 'vitest/config';

const sharedResolve = {
  alias: {
    '@landmatch/db': path.resolve(__dirname, '../../packages/db/src'),
  },
};

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/routes/__tests__/integration/**', 'src/repos/__tests__/**/*.integration.test.ts', 'node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', '**/*.test.ts', '**/*.spec.ts', '**/integration/**', 'dist/'],
    },
  },
  resolve: sharedResolve,
  define: {
    'import.meta.vitest': 'undefined',
  },
});
