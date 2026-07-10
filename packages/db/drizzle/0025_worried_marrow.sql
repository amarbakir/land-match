DROP INDEX "listings_external_id_source_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "listings_feed_external_id_idx" ON "listings" USING btree ("external_id","source") WHERE "listings"."user_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "listings_user_external_id_idx" ON "listings" USING btree ("user_id","external_id","source") WHERE "listings"."user_id" IS NOT NULL;