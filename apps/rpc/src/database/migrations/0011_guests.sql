ALTER TYPE "public"."user_role" ADD VALUE 'guest';--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_role_profile_check";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_anonymous" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD COLUMN "allow_guests" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_profile_check" CHECK (case "users"."role"::text
        when 'admin' then "users"."department" is null and "users"."student_id" is null
        when 'teacher' then "users"."student_id" is null
        when 'student' then "users"."department" is null
        when 'guest' then "users"."department" is null and "users"."student_id" is null and "users"."is_anonymous"
      end);