CREATE TYPE "public"."personal_role" AS ENUM('teacher', 'student');--> statement-breakpoint
ALTER TABLE "bank_questions" DROP CONSTRAINT "bank_questions_demo_check";--> statement-breakpoint
DROP INDEX "students_organization_user_unique";--> statement-breakpoint
DROP INDEX "students_organization_number_unique";--> statement-breakpoint
ALTER TABLE "assets" ALTER COLUMN "organization_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "classes" ALTER COLUMN "organization_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ALTER COLUMN "organization_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ALTER COLUMN "organization_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "personal_role" "personal_role" DEFAULT 'teacher' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "students_organization_number_unique" ON "students" USING btree ("organization_id","student_number") WHERE "students"."organization_id" is not null and "students"."student_number" is not null;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_organization_user_unique" UNIQUE NULLS NOT DISTINCT("organization_id","user_id");--> statement-breakpoint
ALTER TABLE "bank_questions" ADD CONSTRAINT "bank_questions_demo_check" CHECK ("bank_questions"."owner_id" is not null or "bank_questions"."organization_id" is null);