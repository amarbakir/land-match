-- Deduplicate before the unique indexes in the next migration. Check-then-
-- insert with no constraint let concurrent enrichments create duplicate
-- scores (and duplicate alerts). Keep the earliest row per key; duplicate
-- scores' alerts go with them via the ON DELETE CASCADE on alerts.score_id.
DELETE FROM "scores" s
USING "scores" keeper
WHERE keeper."listing_id" = s."listing_id"
  AND keeper."search_profile_id" = s."search_profile_id"
  AND keeper."scored_at" < s."scored_at";--> statement-breakpoint
-- scored_at ties (same-instant inserts): fall back to id order
DELETE FROM "scores" s
USING "scores" keeper
WHERE keeper."listing_id" = s."listing_id"
  AND keeper."search_profile_id" = s."search_profile_id"
  AND keeper."scored_at" = s."scored_at"
  AND keeper."id" < s."id";--> statement-breakpoint
DELETE FROM "alerts" a
USING "alerts" keeper
WHERE keeper."score_id" = a."score_id"
  AND keeper."channel" = a."channel"
  AND (keeper."created_at" < a."created_at"
    OR (keeper."created_at" = a."created_at" AND keeper."id" < a."id"));
