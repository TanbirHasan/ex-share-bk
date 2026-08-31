CREATE TYPE "public"."service_channel" AS ENUM('phone', 'email', 'service_center', 'home_visit', 'social_media', 'other');--> statement-breakpoint
CREATE TYPE "public"."service_repair_outcome" AS ENUM('fixed', 'partly_fixed', 'not_fixed', 'replaced', 'refunded', 'pending');--> statement-breakpoint
CREATE TYPE "public"."service_response_time" AS ENUM('same_day', 'within_3_days', 'within_a_week', 'over_a_week', 'no_response');--> statement-breakpoint
CREATE TYPE "public"."service_warranty" AS ENUM('yes', 'no', 'partial', 'unsure');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_experiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"response_time" "service_response_time" NOT NULL,
	"channel" "service_channel" NOT NULL,
	"repair_outcome" "service_repair_outcome" NOT NULL,
	"warranty" "service_warranty" NOT NULL,
	"technician_rating" integer,
	"issue" text,
	"cost" integer,
	"duration_days" integer,
	"comment" text,
	"content_lang" "content_lang" DEFAULT 'en' NOT NULL,
	"status" "moderation_status" DEFAULT 'approved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_experiences_product_user_uq" UNIQUE("product_id","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_experiences" ADD CONSTRAINT "service_experiences_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_experiences" ADD CONSTRAINT "service_experiences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_experiences_product_idx" ON "service_experiences" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_experiences_user_idx" ON "service_experiences" USING btree ("user_id");