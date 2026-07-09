/**
 * Postgres surfaces a unique-constraint violation as SQLSTATE 23505. The pg
 * driver attaches that as `error.code`. Detecting it lets find-then-insert flows
 * map the lost-race case to a domain conflict (409) instead of a generic 500.
 */
export function isUniqueViolation(error: unknown): boolean {
  return hasSqlState(error, '23505');
}

/** SQLSTATE 23503: referenced row missing — maps to a domain 404, not a 500. */
export function isForeignKeyViolation(error: unknown): boolean {
  return hasSqlState(error, '23503');
}

function hasSqlState(error: unknown, code: string): boolean {
  // Drizzle wraps driver errors (DrizzleQueryError) with the pg error on
  // `cause` — walk the chain rather than trusting the top-level shape.
  for (let e = error; typeof e === 'object' && e !== null; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === code) return true;
  }
  return false;
}
