import { Hono } from 'hono';
import { CreateSearchProfile, UpdateSearchProfile } from '@landmatch/api';

import { badRequest, okResponse, throwFromResult } from '../lib/httpExceptions';
import * as searchProfileService from '../services/searchProfileService';
import type { Env } from '../types/env';

const searchProfiles = new Hono<Env>();

searchProfiles.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const parsed = CreateSearchProfile.safeParse(body);

  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const result = await searchProfileService.create(userId, parsed.data);

  if (!result.ok) {
    return throwFromResult(result);
  }

  return okResponse(c, result.data, 201);
});

searchProfiles.get('/', async (c) => {
  const userId = c.get('userId');
  const result = await searchProfileService.listByUser(userId);

  if (!result.ok) {
    return throwFromResult(result);
  }

  return okResponse(c, result.data);
});

searchProfiles.get('/:id', async (c) => {
  const userId = c.get('userId');
  const result = await searchProfileService.getById(userId, c.req.param('id'));

  if (!result.ok) {
    return throwFromResult(result, { NOT_FOUND: 404, FORBIDDEN: 403 });
  }

  return okResponse(c, result.data);
});

searchProfiles.put('/:id', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const parsed = UpdateSearchProfile.safeParse(body);

  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const result = await searchProfileService.update(userId, c.req.param('id'), parsed.data);

  if (!result.ok) {
    return throwFromResult(result, { NOT_FOUND: 404, FORBIDDEN: 403 });
  }

  return okResponse(c, result.data);
});

searchProfiles.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const result = await searchProfileService.remove(userId, c.req.param('id'));

  if (!result.ok) {
    return throwFromResult(result, { NOT_FOUND: 404, FORBIDDEN: 403 });
  }

  return okResponse(c, null, 200);
});

export default searchProfiles;
