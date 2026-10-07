CREATE TYPE "public"."game_phase" AS ENUM('lobby', 'question', 'reveal', 'leaderboard', 'ended');--> statement-breakpoint
ALTER TYPE "public"."incident_kind" ADD VALUE 'device_switch_allowed';--> statement-breakpoint
ALTER TYPE "public"."incident_kind" ADD VALUE 'retake_granted';--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "game_points_earned" integer;--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "time_ms" integer;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "game_streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD COLUMN "game_question_seconds" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD COLUMN "game_leaderboard" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD COLUMN "game_streak_bonus" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD COLUMN "game_phase" "game_phase";--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD COLUMN "current_question_index" integer;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD COLUMN "question_started_at" timestamp with time zone;