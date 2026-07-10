import { describe, expect, it } from 'vitest';
import type { EnrichmentResult } from '@landmatch/enrichment';

import * as listingRepo from '../listingRepo';
import { seedTwoUsers, seedUrlListing } from './seed';

const URL = 'https://www.landwatch.com/listing/123';

const ENRICHMENT: EnrichmentResult = {
  soil: { capabilityClass: 2, drainageClass: 'well drained', texture: 'loam', suitabilityRatings: { cropland: 85 } },
  flood: { zone: 'X', description: 'Minimal flood hazard' },
  sourcesUsed: ['usda-soil', 'fema-flood'],
  errors: [],
};

describe('findEnrichmentSourceByUrl (integration)', () => {
  it("returns another user's enriched row — the dedupe source deliberately ignores visibility", async () => {
    // Bug this catches: scoping this lookup to visibleTo would re-burn vendor
    // quota for every user after the first (the whole point of 0jx.10 is that
    // user B reuses A's vendor data without ever seeing A's row).
    const [userA] = await seedTwoUsers();
    const owned = await seedUrlListing(URL, userA);
    await listingRepo.insertEnrichment(owned.id, ENRICHMENT);

    const source = await listingRepo.findEnrichmentSourceByUrl(URL);

    expect(source?.listingId).toBe(owned.id);
    expect(source?.enrichment.femaFloodZone).toBe('X');
  });

  it('returns null when rows for the URL exist but none has an enrichment row', async () => {
    // Bug this catches: returning a bare listing would make the copy path
    // clone nothing and skip the vendor pipeline — the listing never enriches.
    const [userA] = await seedTwoUsers();
    await seedUrlListing(URL, userA);

    expect(await listingRepo.findEnrichmentSourceByUrl(URL)).toBeNull();
  });

  it('skips unenriched rows and picks an older enriched one', async () => {
    const [userA, userB] = await seedTwoUsers();
    const enriched = await seedUrlListing(URL, userA);
    await listingRepo.insertEnrichment(enriched.id, ENRICHMENT);
    await seedUrlListing(URL, userB); // newer, but nothing to copy from it

    const source = await listingRepo.findEnrichmentSourceByUrl(URL);

    expect(source?.listingId).toBe(enriched.id);
  });

  it('prefers an older COMPLETE enrichment over a newer partial one', async () => {
    // Bug this catches: a copy made during a vendor outage yesterday (partial,
    // null soil/flood) shadowing months-old complete data — every future
    // caller inherits the degraded copy and the cron re-burns quota healing it.
    const [userA, userB] = await seedTwoUsers();
    const complete = await seedUrlListing(URL, userA, 'enriched');
    await listingRepo.insertEnrichment(complete.id, ENRICHMENT);
    const partial = await seedUrlListing(URL, userB, 'partial'); // newer
    await listingRepo.insertEnrichment(partial.id, { sourcesUsed: ['usda-soil'], errors: [{ source: 'fema-flood', error: 'HTTP 503' }] });

    const source = await listingRepo.findEnrichmentSourceByUrl(URL);

    expect(source?.listingId).toBe(complete.id);
  });

  it('projects the source address so the copy path can detect recycled URLs', async () => {
    const [userA] = await seedTwoUsers();
    const owned = await seedUrlListing(URL, userA);
    await listingRepo.insertEnrichment(owned.id, ENRICHMENT);

    const source = await listingRepo.findEnrichmentSourceByUrl(URL);

    expect(source?.address).toBe('1 Dedupe Rd, MO');
  });
});

describe('listings (user_id, url) unique index (integration)', () => {
  it('a second insert for the same user+url returns null instead of duplicating', async () => {
    // Bug this catches (land-match-ckt): the service-layer dedupe is an
    // advisory read-then-insert — two concurrent POST /enrich both pass the
    // lookups during the vendor fan-out and both insert. The partial unique
    // index is the real defense; onConflictDoNothing surfaces the loss as
    // undefined for the service to re-fetch.
    const [userA] = await seedTwoUsers();
    const insertUrlListing = () =>
      listingRepo.insertListing({ address: '1 Dedupe Rd, MO', latitude: 36.6, longitude: -92.1, url: URL, userId: userA });
    const first = await insertUrlListing();
    const second = await insertUrlListing();

    expect(first).toBeDefined();
    expect(second).toBeNull();
  });

  it('ownerless feed rows and URL-less manual rows stay unconstrained', async () => {
    // Feed delist/relist may legitimately repeat URLs; manual entries have no
    // URL at all — the index predicate must exclude both.
    const [userA] = await seedTwoUsers();
    await seedUrlListing(URL);
    await seedUrlListing(URL); // second ownerless row OK — seed throws on conflict

    const a = await listingRepo.insertListing({ address: '1 NoUrl Rd', latitude: 36.6, longitude: -92.1, userId: userA });
    const b = await listingRepo.insertListing({ address: '2 NoUrl Rd', latitude: 36.6, longitude: -92.1, userId: userA });
    expect(a).toBeDefined();
    expect(b).toBeDefined();
  });
});

describe('external identity per ownership scope (integration)', () => {
  it('two users can each own a row for the same external listing', async () => {
    // Bug this catches (review of land-match-ckt): the global
    // (external_id, source) unique index 500s user B enriching the same
    // Zillow listing user A already owns — the exact case the cross-user
    // copy path exists to serve.
    const [userA, userB] = await seedTwoUsers();
    const insertExt = (userId: string) =>
      listingRepo.insertListing({
        address: '1 Ext Rd, MO',
        latitude: 36.6,
        longitude: -92.1,
        url: URL,
        userId,
        externalId: 'zpid-1',
        source: 'zillow',
      });

    expect(await insertExt(userA)).toBeDefined();
    expect(await insertExt(userB)).toBeDefined();
  });

  it('ownerless feed rows keep global external identity', async () => {
    const feedRow = () =>
      listingRepo.insertListing({
        address: '1 Feed Rd, MO',
        latitude: 36.6,
        longitude: -92.1,
        externalId: 'mls-1',
        source: 'feed',
      });

    expect(await feedRow()).toBeDefined();
    await expect(feedRow()).rejects.toThrow(); // duplicate feed identity still rejected
  });
});

describe('insertEnrichmentCopy (integration)', () => {
  it('clones the data columns onto the target listing under a fresh id', async () => {
    const [userA, userB] = await seedTwoUsers();
    const sourceListing = await seedUrlListing(URL, userA);
    const sourceRow = await listingRepo.insertEnrichment(sourceListing.id, ENRICHMENT);
    const target = await seedUrlListing(URL, userB);

    const copy = await listingRepo.insertEnrichmentCopy(target.id, sourceRow);

    expect(copy.id).not.toBe(sourceRow.id);
    expect(copy.listingId).toBe(target.id);
    expect(copy.soilCapabilityClass).toBe(2);
    expect(copy.femaFloodZone).toBe('X');
    expect(copy.sourcesUsed).toEqual(sourceRow.sourcesUsed);
    // The source row is untouched
    const source = await listingRepo.findListingWithEnrichment(sourceListing.id);
    expect(source?.enrichment?.id).toBe(sourceRow.id);
  });
});
