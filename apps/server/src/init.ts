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
