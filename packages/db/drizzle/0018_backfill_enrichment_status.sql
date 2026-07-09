-- Backfill enrichment_status for rows created while insertListing hardcoded
-- 'enriched' regardless of the pipeline outcome. Errors were never persisted,
-- so status is approximated from sources_used: empty/NULL means every adapter
-- failed; a single source means the other always-available adapter (soil or
-- flood) failed. Rows with no enrichments row at all were never enriched.
UPDATE "listings" l
SET "enrichment_status" = CASE
  WHEN e."sources_used" IS NULL OR cardinality(e."sources_used") = 0 THEN 'failed'
  ELSE 'partial'
END
FROM "enrichments" e
WHERE e."listing_id" = l."id"
  AND l."enrichment_status" = 'enriched'
  AND (e."sources_used" IS NULL OR cardinality(e."sources_used") < 2);--> statement-breakpoint
UPDATE "listings"
SET "enrichment_status" = 'pending'
WHERE "enrichment_status" = 'enriched'
  AND NOT EXISTS (
    SELECT 1 FROM "enrichments" e WHERE e."listing_id" = "listings"."id"
  );
