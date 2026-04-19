import type { MiddlewareHandler } from 'hono';

import type { Env } from '../types/env';
import { unauthorized } from '../lib/httpExceptions';
import { verifyToken } from '../lib/jwt';

function extractBearerToken(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7);
}

export const requireAuth: MiddlewareHandler<Env> = async (c, next) => {
  const token = extractBearerToken(c.req.header('authorization'));
  if (!token) return unauthorized('UNAUTHORIZED');

  const payload = await verifyToken(token, 'access');
  if (!payload) return unauthorized('UNAUTHORIZED');

  c.set('userId', payload.sub);
  await next();
};

export const optionalAuth: MiddlewareHandler<Env> = async (c, next) => {
  const token = extractBearerToken(c.req.header('authorization'));
  if (token) {
    const payload = await verifyToken(token, 'access');
    if (payload) {
      c.set('userId', payload.sub);
    }
  }
  await next();
};
