import fs from 'fs';

import dotenv from 'dotenv';

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

type SslConfig = { rejectUnauthorized: boolean; ca?: string } | undefined;

// DATABASE_SSL_CA holds either inline PEM or a path to a CA bundle file —
// needed for providers whose server certs aren't signed by a public CA
// (Supabase's own CA, the AWS RDS bundle).
function resolveSslCa(): string | undefined {
  const value = process.env.DATABASE_SSL_CA;
  if (!value) return undefined;
  return value.includes('-----BEGIN') ? value : fs.readFileSync(value, 'utf8');
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * TLS policy for DB connections: any remote host gets certificate-verified
 * TLS by default. Plaintext is only for local development — the default
 * localhost URL, or an explicit sslmode=disable.
 */
function resolveSsl(host: string, params: URLSearchParams): SslConfig {
  const sslmode = params.get('sslmode');

  if (sslmode === 'disable') return undefined;
  if (!sslmode && LOCAL_HOSTS.has(host)) return undefined;

  // Encrypts but does not authenticate the server — an explicit, visible
  // escape hatch for dev stages without a CA bundle. Rejected in production.
  if (sslmode === 'no-verify') {
    logger.warn({ host }, 'DB TLS certificate verification disabled via sslmode=no-verify');
    return { rejectUnauthorized: false };
  }

  return { rejectUnauthorized: true, ca: resolveSslCa() };
}

/**
 * Parse a postgres URL into individual connection fields.
 */
function parseDatabaseUrl(url: string) {
  const withoutScheme = url.replace(/^postgres(ql)?:\/\//, '');
  const lastAtIndex = withoutScheme.lastIndexOf('@');
  const credentials = withoutScheme.slice(0, lastAtIndex);
  const hostPart = withoutScheme.slice(lastAtIndex + 1);

  const firstColonIndex = credentials.indexOf(':');
  const user = credentials.slice(0, firstColonIndex);
  const password = credentials.slice(firstColonIndex + 1);

  const [hostAndPort, ...dbParts] = hostPart.split('/');
  const [host, portStr] = hostAndPort.split(':');
  const rawDb = dbParts.join('/');
  const [database, queryString] = rawDb.split('?');
  const params = new URLSearchParams(queryString || '');

  return {
    host,
    port: parseInt(portStr || '5432', 10),
    user,
    password,
    database,
    ssl: resolveSsl(host, params),
    pgbouncer: params.has('pgbouncer'),
  };
}

/**
 * Database configuration
 */
const databaseUrl = optional('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/landmatch');
const directUrl = optional('DIRECT_URL', databaseUrl);

export const database = {
  url: databaseUrl,
  connection: parseDatabaseUrl(databaseUrl),
  directUrl,
  directConnection: parseDatabaseUrl(directUrl),
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
} as const;

export const features = {
  enableParcelData: featureFlag('ENABLE_PARCEL_DATA', false),
  enableClimateRisk: featureFlag('ENABLE_CLIMATE_RISK', false),
  enableGeodataEnrichment: featureFlag('ENABLE_GEODATA_ENRICHMENT', false),
} as const;

export const email = {
  get resendApiKey() {
    return required('RESEND_API_KEY');
  },
  fromAddress: optional('EMAIL_FROM', 'LandMatch <onboarding@resend.dev>'),
  deliveryCronSchedule: optional('EMAIL_CRON_SCHEDULE', '*/5 * * * *'),
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

  if (isProduction) {
    if (!database.url) {
      throw new Error('DATABASE_URL is required in production');
    }
  }
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
