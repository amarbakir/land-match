ALTER TABLE "alerts" DROP CONSTRAINT "alerts_search_profile_id_search_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_score_id_scores_id_fk";
--> statement-breakpoint
ALTER TABLE "scores" DROP CONSTRAINT "scores_search_profile_id_search_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_search_profile_id_search_profiles_id_fk" FOREIGN KEY ("search_profile_id") REFERENCES "public"."search_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_score_id_scores_id_fk" FOREIGN KEY ("score_id") REFERENCES "public"."scores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_search_profile_id_search_profiles_id_fk" FOREIGN KEY ("search_profile_id") REFERENCES "public"."search_profiles"("id") ON DELETE cascade ON UPDATE no action;