import { z } from 'zod';

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

/**
 * HTTP error envelope produced by the server for every non-2xx response
 * (see apps/server/src/lib/httpExceptions.ts). The server always sends
 * `code`; it stays optional here so clients tolerate its absence rather
 * than discarding the error message.
 */
export const ApiErrorEnvelope = z.object({
  ok: z.literal(false),
  code: z.string().optional(),
  error: z.string(),
});
export type ApiErrorEnvelopeType = z.infer<typeof ApiErrorEnvelope>;

/**
 * HTTP success envelope. Only the wrapper is validated — per-endpoint
 * payloads remain typed by client generics.
 */
export const ApiSuccessEnvelope = z.object({
  ok: z.literal(true),
  data: z.unknown().optional(),
});
export type ApiSuccessEnvelopeType = z.infer<typeof ApiSuccessEnvelope>;
