/**
 * Postgres surfaces a unique-constraint violation as SQLSTATE 23505. The pg
 * driver attaches that as `error.code`. Detecting it lets find-then-insert flows
 * map the lost-race case to a domain conflict (409) instead of a generic 500.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}
