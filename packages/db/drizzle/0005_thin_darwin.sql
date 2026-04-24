ALTER TABLE "enrichments" ADD COLUMN "frost_free_days" integer;--> statement-breakpoint
ALTER TABLE "enrichments" ADD COLUMN "annual_precip_in" real;--> statement-breakpoint
ALTER TABLE "enrichments" ADD COLUMN "avg_min_temp_f" real;--> statement-breakpoint
ALTER TABLE "enrichments" ADD COLUMN "avg_max_temp_f" real;--> statement-breakpoint
ALTER TABLE "enrichments" ADD COLUMN "growing_season_days" integer;--> statement-breakpoint
ALTER TABLE "enrichments" ADD COLUMN "elevation_ft" real;--> statement-breakpoint
ALTER TABLE "enrichments" ADD COLUMN "slope_pct" real;--> statement-breakpoint
ALTER TABLE "enrichments" ADD COLUMN "wetland_type" text;--> statement-breakpoint
ALTER TABLE "enrichments" ADD COLUMN "wetland_description" text;--> statement-breakpoint
ALTER TABLE "enrichments" ADD COLUMN "wetland_within_buffer_ft" integer;