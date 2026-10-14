ALTER TABLE "answer_history" DROP CONSTRAINT "answer_history_question_id_questions_id_fk";
--> statement-breakpoint
ALTER TABLE "answers" DROP CONSTRAINT "answers_question_id_questions_id_fk";
--> statement-breakpoint
ALTER TABLE "answer_history" ADD CONSTRAINT "answer_history_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;