// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');

let expoConfig;
try {
  expoConfig = require('eslint-config-expo/flat');
} catch {
  // eslint-config-expo is only installed in apps/frontend; other packages
  // fall back to a minimal config (TypeScript checking is done via tsc).
  expoConfig = null;
}

let tsParser;
if (!expoConfig) {
  try {
    tsParser = require('@typescript-eslint/parser');
  } catch {
    // If no TS parser is available, ESLint will use the default parser.
  }
}

module.exports = defineConfig([
  ...(expoConfig
    ? [expoConfig]
    : [
        {
          files: ['**/*.{ts,tsx}'],
          languageOptions: tsParser ? { parser: tsParser } : {},
          rules: {},
        },
      ]),
  {
    ignores: ['dist/*'],
  },
]);
