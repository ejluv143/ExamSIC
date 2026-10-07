ALTER TYPE "public"."integrity_event_type" ADD VALUE 'disconnected';--> statement-breakpoint
ALTER TYPE "public"."integrity_event_type" ADD VALUE 'device_changed';--> statement-breakpoint
ALTER TYPE "public"."integrity_event_type" ADD VALUE 'network_changed';--> statement-breakpoint
ALTER TYPE "public"."integrity_event_type" ADD VALUE 'shared_device';--> statement-breakpoint
ALTER TYPE "public"."integrity_event_type" ADD VALUE 'shared_network';--> statement-breakpoint
ALTER TYPE "public"."integrity_event_type" ADD VALUE 'too_fast';--> statement-breakpoint
ALTER TYPE "public"."integrity_event_type" ADD VALUE 'devtools_open';--> statement-breakpoint
ALTER TYPE "public"."integrity_event_type" ADD VALUE 'split_screen';--> statement-breakpoint
ALTER TABLE "questions" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
-- Identification and fill in the blank become the one "blank" type (modes identification and inline), blanks are
-- written {{answer|alt}} instead of [answer|alt], multiple choice keeps its correct choices in a list, and essay
-- rubrics become rows with points. Questions, answers and the question bank are converted.
UPDATE "answers" SET "value" = jsonb_build_array("answers"."value") FROM "questions" WHERE "questions"."id" = "answers"."question_id" AND "questions"."type" = 'identification' AND jsonb_typeof("answers"."value") = 'string';--> statement-breakpoint
UPDATE "questions" SET "body" = ("body" - 'correctChoiceId') || jsonb_build_object('correctChoiceIds', jsonb_build_array("body"->'correctChoiceId'), 'multipleCorrect', false) WHERE "type" = 'multiple_choice' AND "body" ? 'correctChoiceId';--> statement-breakpoint
UPDATE "questions" SET "type" = 'blank', "body" = ("body" - 'type') || jsonb_build_object('type', 'blank', 'mode', 'identification') || jsonb_build_object('clozeInput', 'typed', 'wrongOptions', '[]'::jsonb, 'extraWords', '[]'::jsonb) WHERE "type" = 'identification';--> statement-breakpoint
UPDATE "questions" SET "type" = 'blank', "prompt" = regexp_replace("prompt", '\[([^\]]*)\]', '{{\1}}', 'g'), "body" = ("body" - 'type') || jsonb_build_object('type', 'blank', 'mode', 'inline', 'acceptedAnswers', '[]'::jsonb) || jsonb_build_object('clozeInput', 'typed', 'wrongOptions', '[]'::jsonb, 'extraWords', '[]'::jsonb) WHERE "type" = 'fill_in_the_blank';--> statement-breakpoint
UPDATE "questions" SET "body" = "body" || jsonb_build_object('rubric', CASE WHEN btrim(coalesce("body"->>'rubric', '')) = '' THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('id', 'r1', 'criterion', "body"->>'rubric', 'points', "points")) END) WHERE "type" = 'essay' AND jsonb_typeof("body"->'rubric') = 'string';--> statement-breakpoint
UPDATE "bank_questions" SET "question" = "question" || jsonb_build_object('gamePoints', 'standard', 'partialCredit', true) WHERE NOT ("question" ? 'partialCredit');--> statement-breakpoint
UPDATE "bank_questions" SET "question" = ("question" - 'correctChoiceId') || jsonb_build_object('correctChoiceIds', jsonb_build_array("question"->'correctChoiceId'), 'multipleCorrect', false) WHERE "question"->>'type' = 'multiple_choice' AND "question" ? 'correctChoiceId';--> statement-breakpoint
UPDATE "bank_questions" SET "question" = ("question" - 'type') || jsonb_build_object('type', 'blank', 'mode', 'identification') || jsonb_build_object('clozeInput', 'typed', 'wrongOptions', '[]'::jsonb, 'extraWords', '[]'::jsonb) WHERE "question"->>'type' = 'identification';--> statement-breakpoint
UPDATE "bank_questions" SET "question" = jsonb_set("question" - 'type', '{prompt}', to_jsonb(regexp_replace("question"->>'prompt', '\[([^\]]*)\]', '{{\1}}', 'g'))) || jsonb_build_object('type', 'blank', 'mode', 'inline', 'acceptedAnswers', '[]'::jsonb) || jsonb_build_object('clozeInput', 'typed', 'wrongOptions', '[]'::jsonb, 'extraWords', '[]'::jsonb) WHERE "question"->>'type' = 'fill_in_the_blank';--> statement-breakpoint
UPDATE "bank_questions" SET "question" = "question" || jsonb_build_object('rubric', CASE WHEN btrim(coalesce("question"->>'rubric', '')) = '' THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('id', 'r1', 'criterion', "question"->>'rubric', 'points', "question"->'points')) END) WHERE "question"->>'type' = 'essay' AND jsonb_typeof("question"->'rubric') = 'string';--> statement-breakpoint
DROP TYPE "public"."question_type";--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('multiple_choice', 'true_false', 'blank', 'matching', 'enumeration', 'numeric', 'essay', 'code', 'sql');--> statement-breakpoint
ALTER TABLE "questions" ALTER COLUMN "type" SET DATA TYPE "public"."question_type" USING "type"::"public"."question_type";--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "partial_credit" boolean DEFAULT true NOT NULL;