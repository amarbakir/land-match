import { Hono } from 'hono';
import { EnrichListingRequest, ListingByUrlQuery, SavedListingsFilters } from '@landmatch/api';

import { badRequest, okResponse, parseBody, throwFromResult } from '../lib/httpExceptions';
import * as listingService from '../services/listingService';
import type { Env } from '../types/env';

const listings = new Hono<Env>();

listings.post('/enrich', async (c) => {
  const body = await parseBody(c, EnrichListingRequest);

  const userId = c.get('userId');
  const result = await listingService.enrichAndPersist(body, userId);

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

  const result = await listingService.getByUrl(parsed.data.url, c.get('userId'));

  if (!result.ok) {
    return throwFromResult(result, { NOT_FOUND: 404 });
  }

  return okResponse(c, result.data);
});

listings.get('/saved', async (c) => {
  const userId = c.get('userId');

  const parsed = SavedListingsFilters.safeParse({
    sort: c.req.query('sort'),
    sortDir: c.req.query('sortDir'),
    limit: c.req.query('limit'),
    offset: c.req.query('offset'),
  });

  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const result = await listingService.getSavedListings(userId, parsed.data);

  if (!result.ok) {
    return throwFromResult(result, {});
  }

  return okResponse(c, result.data);
});

listings.post('/:id/save', async (c) => {
  const userId = c.get('userId');
  const listingId = c.req.param('id');
  const result = await listingService.saveListing(userId, listingId);

  if (!result.ok) {
    return throwFromResult(result, { NOT_FOUND: 404 });
  }

  return okResponse(c, result.data, 201);
});

listings.delete('/:id/save', async (c) => {
  const userId = c.get('userId');
  const listingId = c.req.param('id');
  const result = await listingService.unsaveListing(userId, listingId);

  if (!result.ok) {
    return throwFromResult(result, { NOT_FOUND: 404 });
  }

  return c.body(null, 204);
});

export default listings;
