-- Identification and fill in the blank become one blank mode, "fill": a prompt with {{blanks}} is answered inline,
-- one without them takes the accepted answers. Answer values are string lists in both, so they stay as they are.
UPDATE "questions" SET "body" = jsonb_set("body", '{mode}', '"fill"') WHERE "type" = 'blank' AND "body"->>'mode' IN ('identification', 'inline');--> statement-breakpoint
UPDATE "bank_questions" SET "question" = jsonb_set("question", '{mode}', '"fill"') WHERE "question"->>'type' = 'blank' AND "question"->>'mode' IN ('identification', 'inline');
