import dotenv from 'dotenv';

import { poolConfig } from '@landmatch/db';

import { logger } from './lib/logger';

// Load .env file
dotenv.config();

/**
 * Environment type - controls validation strictness
 */
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

/**
 * Get required env var - throws in production if missing
 */
function required(name: string, defaultValue?: string): string {
  const value = process.env[name] || defaultValue;
  if (!value) {
    if (isProduction) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    logger.warn(`${name} not set, some features may not work`);
    return '';
  }
  return value;
}

/**
 * Get optional env var with default
 */
function optional(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

// Connection/TLS policy lives in @landmatch/db (single owner across server,
// geodata ETL, and drizzle-kit); policy warnings surface through the server logger.
function parseConnection(url: string) {
  return poolConfig(url, (warning) => logger.warn(warning));
}

/**
 * Database configuration
 */
// required() in production so a forgotten DATABASE_URL fails with "missing
// variable" instead of the localhost default tripping the TLS guard below
// with a misleading certificate error.
const databaseUrl = isProduction
  ? required('DATABASE_URL')
  : optional('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/landmatch');
const directUrl = optional('DIRECT_URL', databaseUrl);

// Lambda containers each hold their own pool behind the Supabase pooler —
// keep them tiny so concurrent invocations don't exhaust pooler slots. The
// long-lived node server gets a normal-sized pool.
function resolvePoolMax(): number {
  const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  const raw = optional('DB_POOL_MAX', isLambda ? '2' : '10');
  const value = parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    // NaN would defeat pg's pool-full check (count >= max is never true) and
    // grow the pool unboundedly — fail loudly instead.
    throw new Error(`DB_POOL_MAX must be a positive integer, got '${raw}'`);
  }
  return value;
}

const connection = parseConnection(databaseUrl);

export const database = {
  url: databaseUrl,
  connection,
  directUrl,
  // DIRECT_URL defaults to DATABASE_URL — don't re-parse (and re-log policy
  // warnings for) the identical string.
  directConnection: directUrl === databaseUrl ? connection : parseConnection(directUrl),
  poolMax: resolvePoolMax(),
} as const;

// Production DB traffic carries credentials, password hashes, and PII —
// refuse to start with plaintext or unverified TLS rather than run MITM-able.
// Checked at import (not validateConfig) so the Lambda entrypoint is covered.
if (isProduction) {
  for (const [name, conn] of [
    ['DATABASE_URL', database.connection],
    ['DIRECT_URL', database.directConnection],
  ] as const) {
    if (conn.ssl?.rejectUnauthorized !== true) {
      throw new Error(
        `${name} must use certificate-verified TLS in production — remove sslmode=disable/no-verify and use a remote host (set DATABASE_SSL_CA for a provider CA bundle)`,
      );
    }
  }
}

/**
 * Server configuration
 */
function resolveCorsOrigin(): string | string[] {
  const raw = isProduction ? required('CORS_ORIGIN') : optional('CORS_ORIGIN', '*');
  const origins = raw.split(',').map((o) => o.trim()).filter(Boolean);

  if (isProduction && origins.includes('*')) {
    throw new Error('CORS_ORIGIN must not be the wildcard "*" in production');
  }

  return origins.length === 1 ? origins[0] : origins;
}

function resolveRateLimitStore(): 'memory' | 'postgres' {
  const value = optional('RATE_LIMIT_STORE', 'memory');
  if (value !== 'memory' && value !== 'postgres') {
    throw new Error(`RATE_LIMIT_STORE must be 'memory' or 'postgres', got '${value}'`);
  }
  return value;
}

export const server = {
  port: parseInt(optional('PORT', '3000'), 10),
  nodeEnv: NODE_ENV,
  isProduction,
  corsOrigin: resolveCorsOrigin(),
  // Trust the rightmost X-Forwarded-For hop for client IPs (behind the ALB).
  trustProxy: featureFlag('TRUST_PROXY', false),
  // 'postgres' shares rate-limit windows across instances; required whenever
  // more than one server process handles traffic (Fargate scale-out, Lambda).
  rateLimitStore: resolveRateLimitStore(),
} as const;

/**
 * Auth configuration
 */
const DEV_JWT_SECRET = 'dev-jwt-secret-change-in-production';

function resolveJwtSecret(): string {
  const value = process.env.JWT_SECRET;
  if (isProduction) {
    if (!value || value === DEV_JWT_SECRET) {
      throw new Error('JWT_SECRET must be set to a non-default value in production');
    }
    return value;
  }
  return value || DEV_JWT_SECRET;
}

export const auth = {
  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: optional('JWT_EXPIRES_IN', '15m'),
  refreshTokenExpiresInDays: 30,
} as const;

/**
 * Feature flags (env-driven, no runtime UI)
 */
export function featureFlag(name: string, defaultVal: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return defaultVal;
  return v === 'true' || v === '1' || v === 'yes';
}

/**
 * LLM configuration (for scoring summaries)
 * Lazy — only evaluated when llmClient is actually called,
 * so missing ANTHROPIC_API_KEY doesn't break startup or tests.
 */
export const llm = {
  get anthropicApiKey() {
    return required('ANTHROPIC_API_KEY');
  },
  model: optional('LLM_SUMMARY_MODEL', 'claude-haiku-4-5-20251001'),
  dailyLimit: Number(optional('LLM_SUMMARY_DAILY_LIMIT', '25')),
} as const;

export const features = {
  enableParcelData: featureFlag('ENABLE_PARCEL_DATA', false),
  enableClimateRisk: featureFlag('ENABLE_CLIMATE_RISK', false),
  enableGeodataEnrichment: featureFlag('ENABLE_GEODATA_ENRICHMENT', false),
  // Lazy: read per access so the flag can flip per test / per Lambda env
  get enableLlmSummary() {
    return featureFlag('ENABLE_LLM_SUMMARY', false);
  },
} as const;

export const email = {
  get resendApiKey() {
    return required('RESEND_API_KEY');
  },
  fromAddress: optional('EMAIL_FROM', 'LandMatch <onboarding@resend.dev>'),
  // Local-dev-only cadence (node-cron). Deployed stages are scheduled by the
  // AlertDelivery cron in sst.config.ts — changing this does not affect them.
  deliveryCronSchedule: optional('EMAIL_CRON_SCHEDULE', '*/5 * * * *'),
  // In-process node-cron delivery is for local dev; deployed stages run the
  // sst.aws.Cron AlertDelivery job instead and set this to false.
  inProcessCron: featureFlag('EMAIL_INPROCESS_CRON', true),
} as const;

// In-process node-cron is for local dev only; deployed stages run the
// sst.aws.Cron ReEnrichment job instead (inProcessCron=false) and these
// settings do not affect them.
export const reEnrichment = {
  cronSchedule: optional('REENRICH_CRON_SCHEDULE', '*/15 * * * *'),
  inProcessCron: featureFlag('REENRICH_INPROCESS_CRON', true),
} as const;

/**
 * Sentry configuration — DSN-optional. Locally, SENTRY_SPOTLIGHT=1 sends
 * events to the Spotlight sidecar with no account needed.
 */
export const sentry = {
  dsn: process.env.SENTRY_DSN || '',
  environment: process.env.SENTRY_ENVIRONMENT || NODE_ENV,
  tracesSampleRate: parseFloat(optional('SENTRY_TRACES_SAMPLE_RATE', '0.1')),
  spotlight: process.env.SENTRY_SPOTLIGHT === '1' || process.env.SENTRY_SPOTLIGHT === 'true',
  get isConfigured() {
    return this.dsn.length > 0;
  },
} as const;

/**
 * Validate configuration at startup
 */
export function validateConfig(): void {
  logger.info(
    {
      env: server.nodeEnv,
      database: database.url ? 'configured' : 'NOT SET',
      auth: auth.jwtSecret ? 'configured' : 'NOT configured',
      emailFrom: email.fromAddress,
      sentry: sentry.isConfigured ? 'configured' : 'not configured',
      spotlight: sentry.spotlight,
    },
    'config loaded',
  );

}

export default {
  database,
  server,
  auth,
  email,
  features,
  sentry,
  validateConfig,
};
