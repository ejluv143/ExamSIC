ALTER TABLE "users" DROP CONSTRAINT "users_role_profile_check";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_profile_check" CHECK (case "users"."role"
        when 'admin' then "users"."department" is null and "users"."student_id" is null
        when 'teacher' then "users"."student_id" is null
        when 'student' then "users"."student_id" is not null and "users"."department" is null
      end);--> statement-breakpoint
-- Sign-up no longer waits for an admin: let in everyone who was still waiting.
UPDATE "users" SET "banned" = false, "ban_reason" = NULL WHERE "banned" AND "ban_reason" = 'Pending approval';
