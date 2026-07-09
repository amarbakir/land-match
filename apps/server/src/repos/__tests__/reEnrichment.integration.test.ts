import { describe, expect, it } from 'vitest';

import { pool } from '../../db/client';
import * as listingRepo from '../listingRepo';
import { seedListing } from './seed';

function insertCandidate(address: string, status: 'partial' | 'failed' | 'enriched') {
  return seedListing(address, undefined, undefined, status);
}

describe('re-enrichment repo queries (integration)', () => {
  it('re-enriching a listing replaces its enrichment row instead of violating the unique constraint', async () => {
    // Bug this catches: enrichments.listing_id is UNIQUE — a plain INSERT on
    // the re-enrichment path would throw 23505 for every partial/failed row
    // that already has an enrichment, making re-enrichment permanently broken.
    const listing = await insertCandidate('1 Upsert Rd, MO', 'partial');

    await listingRepo.insertEnrichment(listing, {
      soil: { capabilityClass: 3, drainageClass: 'well drained', texture: 'loam', suitabilityRatings: {} },
      sourcesUsed: ['usda-soil'],
      errors: [{ source: 'fema-nfhl', error: 'HTTP 503' }],
    });
    await listingRepo.insertEnrichment(listing, {
      flood: { zone: 'AE', description: 'High risk' },
      sourcesUsed: ['fema-nfhl'],
      errors: [{ source: 'usda-soil', error: 'HTTP 503' }],
    });

    const { rows } = await pool.query(
      'SELECT fema_flood_zone, soil_capability_class, sources_used FROM enrichments WHERE listing_id = $1',
      [listing],
    );
    expect(rows).toHaveLength(1);
    // The fresh run wins wholesale — new data present, previous run's data replaced
    expect(rows[0].fema_flood_zone).toBe('AE');
    expect(rows[0].soil_capability_class).toBeNull();
    expect(rows[0].sources_used).toEqual(['fema-nfhl']);
  });

  it('selects only non-enriched rows with retry budget, oldest first', async () => {
    const failed = await insertCandidate('2 Failed Rd, MO', 'failed');
    const partial = await insertCandidate('3 Partial Rd, MO', 'partial');
    await insertCandidate('4 Done Rd, MO', 'enriched');
    const capped = await insertCandidate('5 Capped Rd, MO', 'failed');
    await pool.query('UPDATE listings SET enrichment_attempts = 5 WHERE id = $1', [capped]);
    // No coordinates → nothing to enrich with (feed rows can lack geocoding)
    const noCoords = await insertCandidate('6 NoCoords Rd, MO', 'failed');
    await pool.query('UPDATE listings SET latitude = NULL, longitude = NULL WHERE id = $1', [noCoords]);

    const candidates = await listingRepo.findListingsNeedingEnrichment(10, 5);

    expect(candidates.map((c) => c.id)).toEqual([failed, partial]);
  });

  it('recordEnrichmentAttempt consumes retry budget and only updates status when given one', async () => {
    const listing = await insertCandidate('7 Attempt Rd, MO', 'failed');

    // A run that produced nothing: budget consumed, status untouched
    await listingRepo.recordEnrichmentAttempt(listing, undefined);
    let { rows } = await pool.query('SELECT enrichment_status, enrichment_attempts FROM listings WHERE id = $1', [listing]);
    expect(rows[0]).toEqual({ enrichment_status: 'failed', enrichment_attempts: 1 });

    // A successful run: status reflects the outcome, budget consumed again
    await listingRepo.recordEnrichmentAttempt(listing, 'enriched');
    ({ rows } = await pool.query('SELECT enrichment_status, enrichment_attempts FROM listings WHERE id = $1', [listing]));
    expect(rows[0]).toEqual({ enrichment_status: 'enriched', enrichment_attempts: 2 });
  });
});
