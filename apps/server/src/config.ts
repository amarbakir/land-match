import dotenv from 'dotenv';

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
    console.warn(`Warning: ${name} not set, some features may not work`);
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
    ssl: host.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
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

export const server = {
  port: parseInt(optional('PORT', '3000'), 10),
  nodeEnv: NODE_ENV,
  isProduction,
  corsOrigin: resolveCorsOrigin(),
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
 * Validate configuration at startup
 */
export function validateConfig(): void {
  console.log(`[CONFIG] Environment: ${server.nodeEnv}`);
  console.log(`[CONFIG] Database URL: ${database.url ? 'configured' : 'NOT SET'}`);
  console.log(`[CONFIG] Auth: ${auth.jwtSecret ? 'configured' : 'NOT configured'}`);
  console.log(`[CONFIG] Email: from=${email.fromAddress}`);

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
  validateConfig,
};
