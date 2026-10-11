CREATE TYPE "public"."product_request_content_type" AS ENUM('review', 'problem', 'service');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'product_request_fulfilled';--> statement-breakpoint
ALTER TABLE "product_requests" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "product_requests" ADD COLUMN "content_type" "product_request_content_type";--> statement-breakpoint
ALTER TABLE "product_requests" ADD COLUMN "content_payload" jsonb;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
