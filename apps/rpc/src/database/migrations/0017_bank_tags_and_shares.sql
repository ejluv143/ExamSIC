CREATE TYPE "public"."bank_share_scope" AS ENUM('subject', 'topic', 'question');--> statement-breakpoint
CREATE TABLE "bank_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"scope" "bank_share_scope" NOT NULL,
	"subject" text,
	"topic" text,
	"question_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_shares_unique" UNIQUE NULLS NOT DISTINCT("owner_id","recipient_id","scope","subject","topic","question_id"),
	CONSTRAINT "bank_shares_scope_check" CHECK (case "bank_shares"."scope"::text
        when 'subject' then "bank_shares"."subject" is not null and "bank_shares"."topic" is null and "bank_shares"."question_id" is null
        when 'topic' then "bank_shares"."subject" is null and "bank_shares"."topic" is not null and "bank_shares"."question_id" is null
        when 'question' then "bank_shares"."subject" is null and "bank_shares"."topic" is null and "bank_shares"."question_id" is not null
      end)
);
--> statement-breakpoint
ALTER TABLE "bank_questions" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "bank_questions" ADD COLUMN "subject_area" "subject_area";--> statement-breakpoint
ALTER TABLE "bank_shares" ADD CONSTRAINT "bank_shares_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_shares" ADD CONSTRAINT "bank_shares_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_shares" ADD CONSTRAINT "bank_shares_question_id_bank_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."bank_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_shares_recipient_id_idx" ON "bank_shares" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "bank_questions_owner_subject_topic_idx" ON "bank_questions" USING btree ("owner_id","subject","topic");--> statement-breakpoint
-- bank_questions.question was written as a jsonb string holding the JSON text (the driver encoded it twice), so
-- `question->>'id'` found nothing. Unwrap those rows; the column is written as an object from now on.
UPDATE "bank_questions" SET "question" = ("question" #>> '{}')::jsonb WHERE jsonb_typeof("question") = 'string';
