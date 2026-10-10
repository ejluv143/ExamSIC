-- The admin link moves to students.user_id, the one place it lives now. An entry that already belongs to an
-- account, or an account that already has its own entry, keeps what it has (both columns are unique).
UPDATE "students" SET "user_id" = "users"."id"
FROM "users"
WHERE "users"."student_id" = "students"."id"
  AND "students"."user_id" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "students" AS "own" WHERE "own"."user_id" = "users"."id");--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_student_id_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_role_profile_check";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "student_id";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_profile_check" CHECK (case "users"."role"::text
        when 'admin' then "users"."department" is null
        when 'teacher' then true
        when 'student' then "users"."department" is null
        when 'guest' then "users"."department" is null and "users"."is_anonymous"
      end);