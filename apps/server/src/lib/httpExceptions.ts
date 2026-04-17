import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { type ErrorCodeType, ErrorMessage } from '@landmatch/api';

import type { Env } from '../types/env';
import { ERR } from './errors';

const allCodes = new Set<string>(Object.values(ERR));

function isErrorCode(value: string): value is ErrorCodeType {
  return allCodes.has(value);
}

function jsonError(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ ok: false, code, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Map from HTTP status to generic error code fallback. */
const STATUS_TO_CODE: Record<number, ErrorCodeType> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  500: 'INTERNAL_ERROR',
};

function resolveCodeAndMessage(statusFallback: number, codeOrMessage: string): { code: string; message: string } {
  if (isErrorCode(codeOrMessage)) {
    return { code: codeOrMessage, message: ErrorMessage[codeOrMessage] };
  }
  return { code: STATUS_TO_CODE[statusFallback] ?? 'INTERNAL_ERROR', message: codeOrMessage };
}

export function badRequest(message: string): never {
  const { code, message: msg } = resolveCodeAndMessage(400, message);
  throw new HTTPException(400, { res: jsonError(400, code, msg) });
}

export function notFound(message: string): never {
  const { code, message: msg } = resolveCodeAndMessage(404, message);
  throw new HTTPException(404, { res: jsonError(404, code, msg) });
}

export function forbidden(message: string): never {
  const { code, message: msg } = resolveCodeAndMessage(403, message);
  throw new HTTPException(403, { res: jsonError(403, code, msg) });
}

export function unauthorized(message: string): never {
  const { code, message: msg } = resolveCodeAndMessage(401, message);
  throw new HTTPException(401, { res: jsonError(401, code, msg) });
}

export function conflict(message: string): never {
  const { code, message: msg } = resolveCodeAndMessage(409, message);
  throw new HTTPException(409, { res: jsonError(409, code, msg) });
}

/** Returns a successful JSON response. Default status 200; pass 201 for created. */
export function okResponse<T>(c: Context<Env>, data: T, status?: 200 | 201) {
  return c.json({ ok: true, data }, status ?? 200);
}

/** Default error code → HTTP status mapping. Override per-project. */
const DEFAULT_ERROR_STATUS: Record<string, number> = {};

/**
 * Throws an HTTPException based on a failed Result. Uses DEFAULT_ERROR_STATUS for mapping;
 * pass overrides to change status for specific errors.
 */
export function throwFromResult(result: { ok: false; error: string }, overrides?: Partial<Record<string, number>>): never {
  const status = (overrides?.[result.error] ?? DEFAULT_ERROR_STATUS[result.error] ?? 500) as ContentfulStatusCode;
  const { code, message } = resolveCodeAndMessage(status, result.error);
  throw new HTTPException(status, { res: jsonError(status, code, message) });
}

export { ERR };
