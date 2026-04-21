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

  const result = await listingRepo.findByUrl(parsed.data.url);

  if (!result) {
    return notFound('Listing not found for this URL');
  }

  return okResponse(c, {
    listing: {
      id: result.listing.id,
      address: result.listing.address!,
      latitude: result.listing.latitude!,
      longitude: result.listing.longitude!,
      price: result.listing.price,
      acreage: result.listing.acreage,
      enrichmentStatus: result.listing.enrichmentStatus,
    },
    enrichment: result.enrichment
      ? {
          soilCapabilityClass: result.enrichment.soilCapabilityClass,
          soilDrainageClass: result.enrichment.soilDrainageClass,
          soilTexture: result.enrichment.soilTexture,
          femaFloodZone: result.enrichment.femaFloodZone,
          zoningCode: result.enrichment.zoningCode,
          fireRiskScore: result.enrichment.fireRiskScore,
          floodRiskScore: result.enrichment.floodRiskScore,
          sourcesUsed: result.enrichment.sourcesUsed ?? [],
          errors: [],
        }
      : null,
  });
});

listings.post('/:id/save', async (c) => {
  const userId = c.get('userId');
  if (!userId) return unauthorized('UNAUTHORIZED');

  const listingId = c.req.param('id');

  const listing = await listingRepo.findListingById(listingId);
  if (!listing) return notFound('Listing not found');

  const saved = await listingRepo.saveListing(userId, listingId);

  return okResponse(c, {
    savedAt: saved?.savedAt?.toISOString() ?? new Date().toISOString(),
  }, 201);
});

export default listings;
