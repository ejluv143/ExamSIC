CREATE TABLE "answer_history" (
	"id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL,
	"question_id" text NOT NULL,
	"value" jsonb,
	"saved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grade_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"answer_id" text NOT NULL,
	"changed_by" text,
	"old_score" double precision,
	"new_score" double precision,
	"reason" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "pledge_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD COLUMN "exam" jsonb;--> statement-breakpoint
ALTER TABLE "answer_history" ADD CONSTRAINT "answer_history_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_history" ADD CONSTRAINT "answer_history_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_changes" ADD CONSTRAINT "grade_changes_answer_id_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_changes" ADD CONSTRAINT "grade_changes_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "answer_history_attempt_id_saved_at_idx" ON "answer_history" USING btree ("attempt_id","saved_at");--> statement-breakpoint
CREATE INDEX "grade_changes_answer_id_idx" ON "grade_changes" USING btree ("answer_id");--> statement-breakpoint
UPDATE "quiz_sessions" SET "exam" = jsonb_build_object('computersOnly', true, 'honorPledge', 'I will do this exam on my own. I will not copy, use notes, other people, websites or AI tools unless the exam says I may, and I will not share the questions or my answers with anyone. I understand that cheating can lead to a failing grade and disciplinary action.', 'deviceGraceMinutes', 5) WHERE "mode" = 'exam';
