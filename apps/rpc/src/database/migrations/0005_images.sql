CREATE TYPE "public"."asset_purpose" AS ENUM('question', 'answer');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('pending', 'ready');--> statement-breakpoint
ALTER TYPE "public"."question_type" ADD VALUE 'drawing';--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"purpose" "asset_purpose" NOT NULL,
	"s3_key" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer,
	"width" integer,
	"height" integer,
	"sha256" text,
	"status" "asset_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_s3_key_unique" UNIQUE("s3_key")
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_owner_id_idx" ON "assets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "assets_status_created_at_idx" ON "assets" USING btree ("status","created_at");