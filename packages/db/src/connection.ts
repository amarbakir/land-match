import fs from 'fs';

// Single owner of the database connection/TLS policy. Every process that
// touches the database (server pool, geodata ETL, drizzle-kit) must derive
// its connection from here — the same URL string must never yield different
// security levels per consumer (pg-native URL semantics default to plaintext,
// sslmode=require is UNVERIFIED in raw pg, etc.).

export type SslConfig = { rejectUnauthorized: boolean; ca?: string } | undefined;

export interface ParsedConnection {
  host: string;
  port: number;
  user?: string;
  password?: string;
  database: string;
  ssl: SslConfig;
  pgbouncer: boolean;
  /** Raw sslmode query param, for consumers that hand the URL to libpq tools (psql). */
  sslmode: string | null;
  /** Policy notes (e.g. verification disabled via no-verify) — log at the call site. */
  warnings: string[];
}

// DATABASE_SSL_CA holds either inline PEM or a path to a CA bundle file —
// needed for providers whose server certs aren't signed by a public CA
// (Supabase's own CA, the AWS RDS bundle). Resolved lazily (only when a
// connection actually needs verified TLS, so a stale path in a dev .env
// can't crash a plaintext-localhost setup) and memoized (env is fixed at
// import time; a path-form value shouldn't be re-read per connection).
let sslCaLoaded = false;
let sslCaValue: string | undefined;
function resolveSslCa(): string | undefined {
  if (sslCaLoaded) return sslCaValue;
  sslCaLoaded = true;

  const value = process.env.DATABASE_SSL_CA;
  if (!value) return undefined;

  if (value.includes('-----BEGIN')) {
    // Secrets managers (SSM, JSON env config) commonly flatten PEM newlines
    // to literal "\n" sequences — restore them or the TLS layer can't parse.
    sslCaValue = value.replace(/\\n/g, '\n');
  } else {
    try {
      sslCaValue = fs.readFileSync(value, 'utf8');
    } catch (e) {
      throw new Error(`DATABASE_SSL_CA file not readable: ${value} (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  return sslCaValue;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function isLocalHost(host: string): boolean {
  // Hostnames are case-insensitive.
  return LOCAL_HOSTS.has(host.toLowerCase());
}

/**
 * TLS policy for DB connections: any remote host gets certificate-verified
 * TLS by default. Plaintext is only for local development — the default
 * localhost URL, or an explicit sslmode=disable.
 */
function resolveSsl(host: string, params: URLSearchParams, warnings: string[]): SslConfig {
  const sslmode = params.get('sslmode');

  if (sslmode === 'disable') return undefined;
  if (!sslmode && isLocalHost(host)) return undefined;

  // Encrypts but does not authenticate the server — an explicit, visible
  // escape hatch for dev stages without a CA bundle. Rejected in production
  // by the server's startup guard.
  if (sslmode === 'no-verify') {
    warnings.push(`DB TLS certificate verification disabled via sslmode=no-verify (host: ${host})`);
    return { rejectUnauthorized: false };
  }

  return { rejectUnauthorized: true, ca: resolveSslCa() };
}

/**
 * Parse a postgres URL into individual connection fields with the TLS policy
 * applied. Pass the result to `new Pool(...)` (or drizzle-kit dbCredentials)
 * instead of a raw connection string.
 */
export function parseDatabaseUrl(url: string): ParsedConnection {
  const withoutScheme = url.replace(/^postgres(ql)?:\/\//, '');
  const lastAtIndex = withoutScheme.lastIndexOf('@');
  // No '@' means a credential-less URL (trust-auth local Postgres) — slicing
  // with -1 would smear the host into bogus user/password fields.
  const credentials = lastAtIndex === -1 ? '' : withoutScheme.slice(0, lastAtIndex);
  const hostPart = withoutScheme.slice(lastAtIndex + 1);

  let user: string | undefined;
  let password: string | undefined;
  if (credentials) {
    const firstColonIndex = credentials.indexOf(':');
    user = firstColonIndex === -1 ? credentials : credentials.slice(0, firstColonIndex);
    password = firstColonIndex === -1 ? undefined : credentials.slice(firstColonIndex + 1);
  }

  const [hostAndPort, ...dbParts] = hostPart.split('/');
  // IPv6 literals are bracketed ([::1]:5432) and contain colons, so they
  // can't go through the plain host:port split.
  let host: string;
  let portStr: string | undefined;
  if (hostAndPort.startsWith('[')) {
    const closingBracket = hostAndPort.indexOf(']');
    host = hostAndPort.slice(1, closingBracket);
    portStr = hostAndPort.slice(closingBracket + 2) || undefined; // skip "]:"
  } else {
    [host, portStr] = hostAndPort.split(':');
  }
  const rawDb = dbParts.join('/');
  const [database, queryString] = rawDb.split('?');
  const params = new URLSearchParams(queryString || '');

  const warnings: string[] = [];
  return {
    host,
    port: parseInt(portStr || '5432', 10),
    user,
    password,
    database,
    ssl: resolveSsl(host, params, warnings),
    pgbouncer: params.has('pgbouncer'),
    sslmode: params.get('sslmode'),
    warnings,
  };
}
