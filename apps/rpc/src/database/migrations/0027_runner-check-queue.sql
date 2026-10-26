ALTER TABLE "answers" ADD COLUMN "check_pending_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "check_tries" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "check_claimed_until" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "answers_check_pending_idx" ON "answers" USING btree ("check_claimed_until") WHERE "answers"."check_pending_since" is not null;