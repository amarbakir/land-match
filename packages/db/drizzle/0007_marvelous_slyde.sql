CREATE INDEX "alerts_status_idx" ON "alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "alerts_user_profile_status_idx" ON "alerts" USING btree ("user_id","search_profile_id","status");--> statement-breakpoint
CREATE INDEX "scores_search_profile_id_idx" ON "scores" USING btree ("search_profile_id");--> statement-breakpoint
CREATE INDEX "scores_listing_id_idx" ON "scores" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "search_profiles_user_id_idx" ON "search_profiles" USING btree ("user_id");