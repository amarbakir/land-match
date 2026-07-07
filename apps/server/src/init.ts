import * as Sentry from '@sentry/node';

import { sentry as sentryConfig } from './config';

/**
 * Initialize Sentry if configured (DSN set) or Spotlight is enabled.
 * Call once, first thing at process start.
 */
export function initSentry(): void {
  if (sentryConfig.isConfigured || sentryConfig.spotlight) {
    Sentry.init({
      dsn: sentryConfig.dsn || undefined,
      environment: sentryConfig.environment,
      tracesSampleRate: sentryConfig.tracesSampleRate,
      spotlight: sentryConfig.spotlight,
    });
  }
}

// Self-executing: this module must be imported (as a bare side-effect import,
// first) by any entrypoint so Sentry initializes before other modules load.
// Under tsx/esbuild, imports are hoisted, so a called-from-index.ts init()
// runs too late — only import order at the module-eval level is reliable.
initSentry();
