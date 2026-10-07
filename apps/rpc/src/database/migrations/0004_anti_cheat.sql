ALTER TABLE "answers" ADD COLUMN "time_spent_ms" integer;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "device_id" text;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "ip" text;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "question_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "question_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD COLUMN "one_question_at_a_time" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD COLUMN "question_time_limit_seconds" integer;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD COLUMN "late_join_minutes" integer;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD COLUMN "room_password" text;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD COLUMN "ip_allowlist" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
-- blockCopyPaste becomes separate settings: on turns on the four blocks and clearing the clipboard.
UPDATE "quiz_sessions" SET "integrity" = ("integrity" - 'blockCopyPaste') || jsonb_build_object(
	'blockRightClick', coalesce(("integrity"->>'blockCopyPaste')::boolean, false),
	'blockCopy', coalesce(("integrity"->>'blockCopyPaste')::boolean, false),
	'blockPaste', coalesce(("integrity"->>'blockCopyPaste')::boolean, false),
	'blockPrint', coalesce(("integrity"->>'blockCopyPaste')::boolean, false),
	'clearClipboardOnStart', coalesce(("integrity"->>'blockCopyPaste')::boolean, false),
	'allowPasteInCode', false
) WHERE "integrity" ? 'blockCopyPaste';
