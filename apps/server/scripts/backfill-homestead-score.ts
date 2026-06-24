/**
 * Backfill script: computes and persists homestead_score for enrichment rows
 * where it is currently null. Idempotent — only touches null rows, safe to re-run.
 *
 * Usage: pnpm --filter @landmatch/server backfill:homestead
 */
import '../src/config'; // triggers dotenv

import { eq, isNull } from 'drizzle-orm';
import { enrichments, listings } from '@landmatch/db';

import { db } from '../src/db/client';
import { updateHomesteadScore } from '../src/repos/listingRepo';
import { computeHomestead } from '../src/services/listingService';

async function main() {
  const rows = await db
    .select({ listing: listings, enrichment: enrichments })
    .from(enrichments)
    .innerJoin(listings, eq(enrichments.listingId, listings.id))
    .where(isNull(enrichments.homesteadScore));

  console.log(`[backfill] ${rows.length} enrichment row(s) with null homestead_score`);

  let updated = 0;
  for (const { listing, enrichment } of rows) {
    const { homesteadScore } = computeHomestead(listing, enrichment);
    if (homesteadScore == null) {
      console.warn(`[backfill] score compute returned null for listing ${listing.id} — left null`);
      continue;
    }
    await updateHomesteadScore(listing.id, homesteadScore);
    updated += 1;
  }

  console.log(`[backfill] done — updated ${updated}, left null ${rows.length - updated}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[backfill] fatal error:', err);
  process.exit(1);
});
