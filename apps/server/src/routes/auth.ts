import { Hono } from 'hono';
import { RegisterRequest, LoginRequest, RefreshRequest } from '@landmatch/api';

import { parseBody, throwFromResult, okResponse } from '../lib/httpExceptions';
import * as authService from '../services/authService';
import type { Env } from '../types/env';

const auth = new Hono<Env>();

auth.post('/register', async (c) => {
  const body = await parseBody(c, RegisterRequest);

  const result = await authService.register(body.email, body.password, body.name);

  if (!result.ok) {
    return throwFromResult(result, { EMAIL_ALREADY_EXISTS: 409 });
  }

  return okResponse(c, result.data, 201);
});

auth.post('/login', async (c) => {
  const body = await parseBody(c, LoginRequest);

  const result = await authService.login(body.email, body.password);

  if (!result.ok) {
    return throwFromResult(result, { INVALID_CREDENTIALS: 401 });
  }

  return okResponse(c, result.data);
});

auth.post('/refresh', async (c) => {
  const body = await parseBody(c, RefreshRequest);

  const result = await authService.refresh(body.refreshToken);

  if (!result.ok) {
    return throwFromResult(result, { INVALID_REFRESH_TOKEN: 401 });
  }

  return okResponse(c, result.data);
});

auth.post('/logout', async (c) => {
  const body = await parseBody(c, RefreshRequest);

  const result = await authService.logout(body.refreshToken);

  if (!result.ok) {
    return throwFromResult(result);
  }

  return c.body(null, 204);
});

export default auth;
