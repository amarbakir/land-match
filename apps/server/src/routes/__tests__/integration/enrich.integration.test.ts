import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock ONLY the vendor network call (geocode + USDA/FEMA). Everything else —
// the DB transaction, repos, scoring, matching — runs for real against Postgres.
// importOriginal keeps the package's other exports (adapters used by createApp).
vi.mock('@landmatch/enrichment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@landmatch/enrichment')>();
  return { ...actual, enrichListing: vi.fn() };
});

// Partial repo mock: insertEnrichment defaults to the REAL implementation, but an
// individual test can force it to reject to exercise transaction rollback.
vi.mock('../../../repos/listingRepo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../repos/listingRepo')>();
  return { ...actual, insertEnrichment: vi.fn(actual.insertEnrichment) };
});

import { enrichListing } from '@landmatch/enrichment';

import { createApp } from '../../../app';
import { pool } from '../../../db/client';
import * as listingRepo from '../../../repos/listingRepo';

const mockEnrich = vi.mocked(enrichListing);
const mockInsertEnrichment = vi.mocked(listingRepo.insertEnrichment);

function enrichmentPayload() {
  return {
    ok: true as const,
    data: {
      geocode: { lat: 36.6, lng: -92.1, matchedAddress: '123 Rural Rd, Ozark County, MO' },
      enrichment: {
        soil: { capabilityClass: 2, drainageClass: 'well drained', texture: 'loam', suitabilityRatings: {} },
        flood: { zone: 'X', description: 'Minimal flood hazard' },
        sourcesUsed: ['usda', 'fema'],
        errors: [],
      },
    },
  };
}

function postEnrich(body: unknown) {
  return createApp().request('/api/v1/listings/enrich', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockEnrich.mockResolvedValue(enrichmentPayload());
});

describe('enrich (integration)', () => {
  it('persists the listing and enrichment together and stores a homestead score', async () => {
    const res = await postEnrich({ address: '123 Rural Rd, MO', price: 50000, acreage: 40 });
    expect(res.status).toBe(201);

    const listings = await pool.query(
      'SELECT id, latitude, longitude, price, enrichment_status FROM listings',
    );
    expect(listings.rows).toHaveLength(1);
    // Bug this catches: using the raw input coordinates (none provided) instead of
    // the geocode result would place the listing at 0,0.
    expect(listings.rows[0].latitude).toBeCloseTo(36.6, 5);
    expect(listings.rows[0].longitude).toBeCloseTo(-92.1, 5);
    expect(listings.rows[0].price).toBe(50000);

    const enr = await pool.query(
      'SELECT listing_id, fema_flood_zone, soil_capability_class, homestead_score FROM enrichments',
    );
    expect(enr.rows).toHaveLength(1);
    expect(enr.rows[0].listing_id).toBe(listings.rows[0].id);
    expect(enr.rows[0].fema_flood_zone).toBe('X');
    // Bug this catches: if the homestead score isn't computed+written inside the
    // transaction, the saved view falls back to per-request compute forever.
    expect(enr.rows[0].homestead_score).not.toBeNull();
    expect(typeof enr.rows[0].homestead_score).toBe('number');
  });

  it('rolls back the listing when enrichment persistence fails (atomicity)', async () => {
    // insertListing succeeds, then the enrichment write throws mid-transaction.
    mockInsertEnrichment.mockRejectedValueOnce(new Error('enrichment insert failed'));

    const res = await postEnrich({ address: '456 Fail Rd, MO', price: 30000 });

    // The whole operation fails...
    expect(res.status).toBe(500);
    // ...and crucially leaves NO orphaned listing row behind. Bug this catches:
    // if insertListing and the enrichment write weren't in one transaction, a
    // failed enrichment would leak a half-populated listing.
    const count = await pool.query('SELECT count(*)::int AS n FROM listings');
    expect(count.rows[0].n).toBe(0);
  });
});
