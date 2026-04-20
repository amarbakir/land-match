ALTER TABLE "scores" ADD COLUMN "status" text DEFAULT 'inbox' NOT NULL;--> statement-breakpoint
ALTER TABLE "scores" ADD COLUMN "read_at" timestamp with time zone;