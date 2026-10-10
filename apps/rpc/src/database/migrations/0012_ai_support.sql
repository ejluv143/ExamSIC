CREATE TYPE "public"."ai_provider" AS ENUM('openai', 'anthropic', 'gemini');--> statement-breakpoint
CREATE TABLE "ai_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text,
	"provider" "ai_provider" NOT NULL,
	"secret" text NOT NULL,
	"last4" text NOT NULL,
	"model" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_keys_owner_id_provider_unique" UNIQUE NULLS NOT DISTINCT("owner_id","provider")
);
--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "ai_suggestion" jsonb;--> statement-breakpoint
ALTER TABLE "ai_keys" ADD CONSTRAINT "ai_keys_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;