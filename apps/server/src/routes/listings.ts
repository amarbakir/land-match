import { Hono } from 'hono';
import { EnrichListingRequest, ListingByUrlQuery } from '@landmatch/api';

import { badRequest, notFound, okResponse, throwFromResult, unauthorized } from '../lib/httpExceptions';
import * as listingRepo from '../repos/listingRepo';
import * as listingService from '../services/listingService';
import type { Env } from '../types/env';

const listings = new Hono<Env>();

listings.post('/enrich', async (c) => {
  const body = await c.req.json();
  const parsed = EnrichListingRequest.safeParse(body);

  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const userId = c.get('userId');
  const result = await listingService.enrichAndPersist(parsed.data, userId);

  if (!result.ok) {
    return throwFromResult(result, { GEOCODE_FAILED: 422 });
  }

  return okResponse(c, result.data, 201);
});

listings.get('/by-url', async (c) => {
  const parsed = ListingByUrlQuery.safeParse({ url: c.req.query('url') });

  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const result = await listingService.getByUrl(parsed.data.url);

  if (!result.ok) {
    return throwFromResult(result, { NOT_FOUND: 404 });
  }

  return okResponse(c, result.data);
});

listings.post('/:id/save', async (c) => {
  const userId = c.get('userId');
  if (!userId) return unauthorized('UNAUTHORIZED');

  const listingId = c.req.param('id');
  const saved = await listingRepo.saveListing(userId, listingId);

  if (!saved) {
    // onConflictDoNothing returns nothing if already saved — that's fine
    return okResponse(c, { savedAt: new Date().toISOString() }, 201);
  }

  return okResponse(c, {
    savedAt: saved.savedAt.toISOString(),
  }, 201);
});

export default listings;
