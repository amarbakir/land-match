DROP INDEX "alerts_user_profile_status_idx";--> statement-breakpoint
CREATE INDEX "alerts_user_profile_status_idx" ON "alerts" USING btree ("user_id","search_profile_id","status","sent_at");