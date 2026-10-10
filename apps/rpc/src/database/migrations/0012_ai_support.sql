CREATE TYPE "public"."ai_provider" AS ENUM('openai', 'anthropic', 'gemini');--> statement-breakpoint
CREATE TABLE "ai_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"secret" text NOT NULL,
	"last4" text NOT NULL,
	"model" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_keys_provider_unique" UNIQUE("provider")
);
--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "ai_suggestion" jsonb;