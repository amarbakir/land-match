import { Hono } from 'hono';
import { MatchFilters } from '@landmatch/api';

import { badRequest, okResponse, throwFromResult } from '../lib/httpExceptions';
import * as matchService from '../services/matchService';
import type { Env } from '../types/env';

const matches = new Hono<Env>();

// GET /search-profiles/:id/matches
matches.get('/:id/matches', async (c) => {
  const userId = c.get('userId');
  const profileId = c.req.param('id');

  const parsed = MatchFilters.safeParse(c.req.query());
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const result = await matchService.getMatches(userId, profileId, parsed.data);
  if (!result.ok) {
    return throwFromResult(result, { NOT_FOUND: 404, FORBIDDEN: 403 });
  }

  return okResponse(c, result.data);
});

// GET /search-profiles/counts
matches.get('/counts', async (c) => {
  const userId = c.get('userId');
  const result = await matchService.getProfileCounts(userId);

  if (!result.ok) {
    return throwFromResult(result);
  }

  return okResponse(c, result.data);
});

export default matches;
