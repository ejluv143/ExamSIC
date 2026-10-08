ALTER TABLE "users" DROP CONSTRAINT "users_role_profile_check";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_profile_check" CHECK (case "users"."role"
        when 'admin' then "users"."department" is null and "users"."student_id" is null
        when 'teacher' then "users"."student_id" is null
        when 'student' then "users"."department" is null
      end);