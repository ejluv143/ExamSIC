ALTER TABLE "answers" ADD COLUMN "tries" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "tries_log" jsonb;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "mastery_queue" jsonb;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD COLUMN "mastery" jsonb;