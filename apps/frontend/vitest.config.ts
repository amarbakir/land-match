import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', 'dist'],
  },
  resolve: {
    alias: {
      '@landmatch/api': path.resolve(__dirname, '../../packages/api/src'),
      '@': path.resolve(__dirname),
      // Stub native/UI dependencies so pure-logic tests can import component
      // files without crashing on Flow types or missing native modules.
      'react-native': path.resolve(__dirname, 'src/__mocks__/react-native.ts'),
      'react-native-svg': path.resolve(__dirname, 'src/__mocks__/empty.ts'),
      tamagui: path.resolve(__dirname, 'src/__mocks__/empty.ts'),
    },
  },
});
