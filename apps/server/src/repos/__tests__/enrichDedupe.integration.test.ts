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
