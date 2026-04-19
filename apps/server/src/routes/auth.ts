import { Hono } from 'hono';
import { RegisterRequest, LoginRequest, RefreshRequest } from '@landmatch/api';

import { badRequest, throwFromResult, okResponse } from '../lib/httpExceptions';
import * as authService from '../services/authService';
import type { Env } from '../types/env';

const auth = new Hono<Env>();

auth.post('/register', async (c) => {
  const body = await c.req.json();
  const parsed = RegisterRequest.safeParse(body);

  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const result = await authService.register(parsed.data.email, parsed.data.password, parsed.data.name);

  if (!result.ok) {
    return throwFromResult(result, { EMAIL_ALREADY_EXISTS: 409 });
  }

  return okResponse(c, result.data, 201);
});

auth.post('/login', async (c) => {
  const body = await c.req.json();
  const parsed = LoginRequest.safeParse(body);

  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const result = await authService.login(parsed.data.email, parsed.data.password);

  if (!result.ok) {
    return throwFromResult(result, { INVALID_CREDENTIALS: 401 });
  }

  return okResponse(c, result.data);
});

auth.post('/refresh', async (c) => {
  const body = await c.req.json();
  const parsed = RefreshRequest.safeParse(body);

  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const result = await authService.refresh(parsed.data.refreshToken);

  if (!result.ok) {
    return throwFromResult(result, { INVALID_REFRESH_TOKEN: 401, USER_NOT_FOUND: 401 });
  }

  return okResponse(c, result.data);
});

export default auth;
