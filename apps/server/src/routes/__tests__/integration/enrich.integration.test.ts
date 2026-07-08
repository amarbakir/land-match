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

async function registerUser(email: string): Promise<string> {
  const res = await createApp().request('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  });
  const body = (await res.json()) as { data: { accessToken: string } };
  return body.data.accessToken;
}

function postEnrich(body: unknown, token?: string) {
  return createApp().request('/api/v1/listings/enrich', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function getByUrl(url: string, token?: string) {
  return createApp().request(`/api/v1/listings/by-url?url=${encodeURIComponent(url)}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  // Clear call history so per-test assertions like `not.toHaveBeenCalled()`
  // aren't polluted by earlier tests (implementations survive clearing).
  vi.clearAllMocks();
  mockEnrich.mockResolvedValue(enrichmentPayload());
});

describe('enrich (integration)', () => {
  it('persists the listing and enrichment together, owned by the caller, with a homestead score', async () => {
    const token = await registerUser('enricher@example.com');
    const res = await postEnrich({ address: '123 Rural Rd, MO', price: 50000, acreage: 40 }, token);
    expect(res.status).toBe(201);

    const listings = await pool.query(
      'SELECT id, latitude, longitude, price, user_id, enrichment_status FROM listings',
    );
    expect(listings.rows).toHaveLength(1);
    // Bug this catches: using the raw input coordinates (none provided) instead of
    // the geocode result would place the listing at 0,0.
    expect(listings.rows[0].latitude).toBeCloseTo(36.6, 5);
    expect(listings.rows[0].longitude).toBeCloseTo(-92.1, 5);
    expect(listings.rows[0].price).toBe(50000);
    // Bug this catches: dropping the userId between requireAuth and insertListing
    // would create an ownerless (globally visible) listing for an authenticated call.
    const { rows: users } = await pool.query('SELECT id FROM users');
    expect(listings.rows[0].user_id).toBe(users[0].id);

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
    const token = await registerUser('rollback@example.com');
    // insertListing succeeds, then the enrichment write throws mid-transaction.
    mockInsertEnrichment.mockRejectedValueOnce(new Error('enrichment insert failed'));

    const res = await postEnrich({ address: '456 Fail Rd, MO', price: 30000 }, token);

    // The whole operation fails...
    expect(res.status).toBe(500);
    // ...and crucially leaves NO orphaned listing row behind. Bug this catches:
    // if insertListing and the enrichment write weren't in one transaction, a
    // failed enrichment would leak a half-populated listing.
    const count = await pool.query('SELECT count(*)::int AS n FROM listings');
    expect(count.rows[0].n).toBe(0);
  });

  it('rejects an anonymous enrich with 401 before any vendor call or DB write', async () => {
    // Bug this catches: reverting /listings/* to optionalAuth. An anonymous
    // caller could inject stored listings that get scored against every user's
    // profiles (alert emails), and burn geocode/USDA/FEMA quota.
    const res = await postEnrich({ address: '123 Rural Rd, MO' });

    expect(res.status).toBe(401);
    expect(mockEnrich).not.toHaveBeenCalled();
    const count = await pool.query('SELECT count(*)::int AS n FROM listings');
    expect(count.rows[0].n).toBe(0);
  });

  it('rejects an anonymous by-url lookup with 401', async () => {
    const res = await getByUrl('https://example.com/listing/1');
    expect(res.status).toBe(401);
  });
});

describe('by-url visibility (integration)', () => {
  const LISTING_URL = 'https://landwatch.example.com/listing/42';

  it("returns the caller's own enriched listing but hides other users' listings", async () => {
    const ownerToken = await registerUser('owner@example.com');
    const otherToken = await registerUser('other@example.com');

    const enriched = await postEnrich({ address: '123 Rural Rd, MO', url: LISTING_URL }, ownerToken);
    expect(enriched.status).toBe(201);

    const asOwner = await getByUrl(LISTING_URL, ownerToken);
    expect(asOwner.status).toBe(200);

    // Bug this catches: unscoped findByUrl lets any user read listings another
    // user enriched (cross-tenant read of price/address/URL they submitted).
    const asOther = await getByUrl(LISTING_URL, otherToken);
    expect(asOther.status).toBe(404);
  });

  it('returns ownerless (feed) listings to any authenticated user', async () => {
    const token = await registerUser('reader@example.com');
    // Feed-pipeline listings have no owner and are global by design.
    await pool.query(
      `INSERT INTO listings (id, source, address, latitude, longitude, url, enrichment_status, first_seen_at, last_seen_at)
       VALUES ('lst-feed-1', 'feed', '789 Feed Rd, MO', 36.1, -92.5, $1, 'enriched', now(), now())`,
      [LISTING_URL],
    );

    // Bug this catches: over-tightening the scope to userId = caller only,
    // which would hide every feed listing from every user.
    const res = await getByUrl(LISTING_URL, token);
    expect(res.status).toBe(200);
  });
});
