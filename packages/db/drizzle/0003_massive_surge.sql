CREATE TABLE "saved_listings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "saved_listings" ADD CONSTRAINT "saved_listings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_listings" ADD CONSTRAINT "saved_listings_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_listings_user_listing_idx" ON "saved_listings" USING btree ("user_id","listing_id");--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;