import { Hono } from 'hono';
import { EnrichListingRequest } from '@landmatch/api';

import { badRequest, okResponse, throwFromResult } from '../lib/httpExceptions';
import * as listingService from '../services/listingService';
import type { Env } from '../types/env';

const listings = new Hono<Env>();

listings.post('/enrich', async (c) => {
  const body = await c.req.json();
  const parsed = EnrichListingRequest.safeParse(body);

  if (!parsed.success) {
    badRequest(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const result = await listingService.enrichAndPersist(parsed.data);

  if (!result.ok) {
    throwFromResult(result, { GEOCODE_FAILED: 422 });
  }

  return okResponse(c, result.data, 201);
});

export default listings;
