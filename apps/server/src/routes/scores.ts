import { Hono } from 'hono';
import { UpdateMatchStatus } from '@landmatch/api';

import { badRequest, okResponse, throwFromResult } from '../lib/httpExceptions';
import * as matchService from '../services/matchService';
import type { Env } from '../types/env';

const scoresRouter = new Hono<Env>();

// GET /scores/:id
scoresRouter.get('/:id', async (c) => {
  const userId = c.get('userId');
  const scoreId = c.req.param('id');

  const result = await matchService.getMatchDetail(userId, scoreId);
  if (!result.ok) {
    return throwFromResult(result, { NOT_FOUND: 404, FORBIDDEN: 403 });
  }

  return okResponse(c, result.data);
});

// PATCH /scores/:id
scoresRouter.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const scoreId = c.req.param('id');
  const body = await c.req.json();

  const parsed = UpdateMatchStatus.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const result = await matchService.updateMatchStatus(userId, scoreId, parsed.data);
  if (!result.ok) {
    return throwFromResult(result, { NOT_FOUND: 404, FORBIDDEN: 403 });
  }

  return okResponse(c, result.data);
});

export default scoresRouter;
