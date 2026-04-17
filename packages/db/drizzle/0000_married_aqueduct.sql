CREATE TABLE "alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"search_profile_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"score_id" text NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrichments" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"soil_capability_class" integer,
	"soil_drainage_class" text,
	"soil_texture" text,
	"soil_suitability_ratings" jsonb,
	"fema_flood_zone" text,
	"flood_zone_description" text,
	"zoning_code" text,
	"zoning_description" text,
	"verified_acreage" real,
	"parcel_geometry" jsonb,
	"fire_risk_score" integer,
	"flood_risk_score" integer,
	"heat_risk_score" integer,
	"drought_risk_score" integer,
	"enriched_at" timestamp with time zone,
	"sources_used" text[],
	CONSTRAINT "enrichments_listing_id_unique" UNIQUE("listing_id")
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" text PRIMARY KEY NOT NULL,
	"external_id" text,
	"source" text NOT NULL,
	"url" text,
	"title" text,
	"description" text,
	"price" real,
	"acreage" real,
	"address" text,
	"city" text,
	"county" text,
	"state" text,
	"zip" text,
	"latitude" real,
	"longitude" real,
	"raw_data" jsonb,
	"enrichment_status" text DEFAULT 'pending' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delisted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"search_profile_id" text NOT NULL,
	"overall_score" integer NOT NULL,
	"component_scores" jsonb NOT NULL,
	"llm_summary" text,
	"scored_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"is_active" text DEFAULT 'true' NOT NULL,
	"alert_frequency" text DEFAULT 'daily' NOT NULL,
	"alert_threshold" integer DEFAULT 60 NOT NULL,
	"criteria" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"phone" text,
	"auth_provider" text DEFAULT 'email' NOT NULL,
	"password_hash" text,
	"subscription_tier" text DEFAULT 'free' NOT NULL,
	"notification_prefs" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_search_profile_id_search_profiles_id_fk" FOREIGN KEY ("search_profile_id") REFERENCES "public"."search_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_score_id_scores_id_fk" FOREIGN KEY ("score_id") REFERENCES "public"."scores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichments" ADD CONSTRAINT "enrichments_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_search_profile_id_search_profiles_id_fk" FOREIGN KEY ("search_profile_id") REFERENCES "public"."search_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_profiles" ADD CONSTRAINT "search_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;