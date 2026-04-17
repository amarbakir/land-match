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
export const server = {
  port: parseInt(optional('PORT', '3000'), 10),
  nodeEnv: NODE_ENV,
  isProduction,
  corsOrigin: isProduction ? required('CORS_ORIGIN') : optional('CORS_ORIGIN', '*'),
} as const;

/**
 * Auth configuration
 */
export const auth = {
  jwtSecret: required('JWT_SECRET', 'dev-jwt-secret-change-in-production'),
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

export const features = {
  enableParcelData: featureFlag('ENABLE_PARCEL_DATA', false),
  enableClimateRisk: featureFlag('ENABLE_CLIMATE_RISK', false),
} as const;

/**
 * Validate configuration at startup
 */
export function validateConfig(): void {
  console.log(`[CONFIG] Environment: ${server.nodeEnv}`);
  console.log(`[CONFIG] Database URL: ${database.url ? 'configured' : 'NOT SET'}`);
  console.log(`[CONFIG] Auth: ${auth.jwtSecret ? 'configured' : 'NOT configured'}`);

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
  features,
  validateConfig,
};
