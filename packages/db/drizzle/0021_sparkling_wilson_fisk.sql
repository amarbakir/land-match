DROP INDEX "scores_listing_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_score_channel_idx" ON "alerts" USING btree ("score_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "scores_listing_profile_idx" ON "scores" USING btree ("listing_id","search_profile_id");