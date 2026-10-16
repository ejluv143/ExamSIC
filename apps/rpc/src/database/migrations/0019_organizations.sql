CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"inviter_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_organization_user_unique" UNIQUE("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organization_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" text NOT NULL,
	"role" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_invites_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "organization_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"permission" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_roles_organization_role_unique" UNIQUE("organization_id","role")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
-- Everything that exists goes into one default organization, with every real account as a member. Platform admins
-- own it; teachers and students keep their role there. A database with no accounts or content yet gets no default
-- organization: the first teacher to sign up makes their own.
INSERT INTO "organizations" ("id", "name", "slug")
SELECT 'org-default', 'Examinus', 'default'
WHERE EXISTS (SELECT 1 FROM "users" WHERE "role"::text <> 'guest')
   OR EXISTS (SELECT 1 FROM "classes") OR EXISTS (SELECT 1 FROM "quizzes") OR EXISTS (SELECT 1 FROM "students")
   OR EXISTS (SELECT 1 FROM "assets") OR EXISTS (SELECT 1 FROM "ai_keys") OR EXISTS (SELECT 1 FROM "bank_shares")
   OR EXISTS (SELECT 1 FROM "bank_questions" WHERE "owner_id" IS NOT NULL);--> statement-breakpoint
INSERT INTO "members" ("id", "organization_id", "user_id", "role")
SELECT 'mem-' || "id", 'org-default', "id",
  CASE "role"::text WHEN 'admin' THEN 'owner' WHEN 'teacher' THEN 'teacher' ELSE 'student' END
FROM "users" WHERE "role"::text <> 'guest' AND EXISTS (SELECT 1 FROM "organizations" WHERE "id" = 'org-default');--> statement-breakpoint
ALTER TABLE "students" DROP CONSTRAINT "students_user_id_unique";--> statement-breakpoint
ALTER TABLE "ai_keys" DROP CONSTRAINT "ai_keys_provider_unique";--> statement-breakpoint
ALTER TABLE "bank_shares" DROP CONSTRAINT "bank_shares_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_role_profile_check";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."user_role";--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'user', 'guest');--> statement-breakpoint
-- Teaching and learning roles are organization memberships now; the platform role only says who runs the platform.
UPDATE "users" SET "role" = 'user' WHERE "role" IN ('teacher', 'student');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING "role"::"public"."user_role";--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "assets" SET "organization_id" = 'org-default';--> statement-breakpoint
ALTER TABLE "assets" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "active_organization_id" text;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "classes" SET "organization_id" = 'org-default';--> statement-breakpoint
ALTER TABLE "classes" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "students" SET "organization_id" = 'org-default';--> statement-breakpoint
ALTER TABLE "students" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_keys" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "ai_keys" SET "organization_id" = 'org-default';--> statement-breakpoint
ALTER TABLE "ai_keys" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_questions" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "bank_questions" SET "organization_id" = 'org-default' WHERE "owner_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_shares" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "bank_shares" SET "organization_id" = 'org-default';--> statement-breakpoint
ALTER TABLE "bank_shares" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "quizzes" SET "organization_id" = 'org-default';--> statement-breakpoint
ALTER TABLE "quizzes" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_roles" ADD CONSTRAINT "organization_roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitations_organization_id_idx" ON "invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "members_user_id_idx" ON "members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "organization_invites_organization_id_idx" ON "organization_invites" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_roles_role_idx" ON "organization_roles" USING btree ("role");--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_keys" ADD CONSTRAINT "ai_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_questions" ADD CONSTRAINT "bank_questions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_shares" ADD CONSTRAINT "bank_shares_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_organization_id_idx" ON "assets" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "classes_organization_id_idx" ON "classes" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "students_organization_user_unique" ON "students" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "students_organization_number_unique" ON "students" USING btree ("organization_id","student_number") WHERE "students"."student_number" is not null;--> statement-breakpoint
CREATE INDEX "students_organization_id_idx" ON "students" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "bank_questions_organization_id_idx" ON "bank_questions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "bank_shares_organization_id_idx" ON "bank_shares" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "quizzes_organization_id_idx" ON "quizzes" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "ai_keys" ADD CONSTRAINT "ai_keys_organization_provider_unique" UNIQUE("organization_id","provider");--> statement-breakpoint
ALTER TABLE "bank_shares" ADD CONSTRAINT "bank_shares_unique" UNIQUE NULLS NOT DISTINCT("organization_id","owner_id","recipient_id","scope","subject","topic","question_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_profile_check" CHECK (case "users"."role"::text
        when 'guest' then "users"."department" is null and "users"."is_anonymous"
        else not "users"."is_anonymous"
      end);--> statement-breakpoint
ALTER TABLE "bank_questions" ADD CONSTRAINT "bank_questions_demo_check" CHECK (("bank_questions"."owner_id" is null) = ("bank_questions"."organization_id" is null));