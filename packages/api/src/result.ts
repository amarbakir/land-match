/**
 * Result type for operations that can fail
 */
export type Result<T, E = string> = { ok: true; data: T } | { ok: false; error: E };

/**
 * Create a success result
 */
export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

/**
 * Create an error result
 */
export function err<E = string>(error: E): Result<never, E> {
  return { ok: false, error };
}
