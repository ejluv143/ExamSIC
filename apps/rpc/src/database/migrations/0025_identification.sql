-- Identification questions keep every answer as a {{blank}} in the prompt. An old "fill" question with no blanks had
-- its answers in body.acceptedAnswers: they become one blank after the prompt ({{#...}} when answered in letter
-- boxes). questions.body is a jsonb string (Drizzle's jsonb through Bun.sql JSON-encodes twice), bank_questions.question
-- a jsonb object with the prompt inside; both are handled.
UPDATE "questions" SET "prompt" = "questions"."prompt" || ' {{' || (CASE WHEN q.b->>'answerBox' = 'boxes' THEN '#' ELSE '' END) || array_to_string(ARRAY(SELECT jsonb_array_elements_text(q.b->'acceptedAnswers')), '|') || '}}'
FROM (SELECT "id", CASE WHEN jsonb_typeof("body") = 'string' THEN ("body" #>> '{}')::jsonb ELSE "body" END AS b FROM "questions" WHERE "type" = 'blank') q
WHERE "questions"."id" = q."id" AND q.b->>'mode' = 'fill' AND "questions"."prompt" NOT LIKE '%{{%' AND jsonb_typeof(q.b->'acceptedAnswers') = 'array' AND jsonb_array_length(q.b->'acceptedAnswers') > 0;--> statement-breakpoint
UPDATE "questions" SET "body" = CASE WHEN jsonb_typeof("body") = 'string' THEN to_jsonb(((("body" #>> '{}')::jsonb) - 'mode' - 'acceptedAnswers' - 'answerBox')::text) ELSE "body" - 'mode' - 'acceptedAnswers' - 'answerBox' END WHERE "type" = 'blank';--> statement-breakpoint
UPDATE "bank_questions" SET "question" = jsonb_set("question", '{prompt}', to_jsonb("question"->>'prompt' || ' {{' || (CASE WHEN "question"->>'answerBox' = 'boxes' THEN '#' ELSE '' END) || array_to_string(ARRAY(SELECT jsonb_array_elements_text("question"->'acceptedAnswers')), '|') || '}}')) WHERE "question"->>'type' = 'blank' AND "question"->>'mode' = 'fill' AND "question"->>'prompt' NOT LIKE '%{{%' AND jsonb_typeof("question"->'acceptedAnswers') = 'array' AND jsonb_array_length("question"->'acceptedAnswers') > 0;--> statement-breakpoint
UPDATE "bank_questions" SET "question" = "question" - 'mode' - 'acceptedAnswers' - 'answerBox' WHERE "question"->>'type' = 'blank';
