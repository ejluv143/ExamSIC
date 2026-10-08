CREATE TYPE "public"."session_navigation" AS ENUM('free', 'marked_only', 'forward_only');--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "marked_for_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "shown_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "furthest_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD COLUMN "navigation" "session_navigation" DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD COLUMN "max_marked" integer;--> statement-breakpoint
-- One question at a time used to mean no going back.
UPDATE "quiz_sessions" SET "navigation" = 'forward_only' WHERE "one_question_at_a_time";--> statement-breakpoint
UPDATE "attempts" SET "furthest_index" = "question_index";
