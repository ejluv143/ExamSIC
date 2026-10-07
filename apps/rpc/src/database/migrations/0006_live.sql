CREATE TYPE "public"."incident_kind" AS ENUM('pause', 'resume', 'add_time', 'warn', 'lock', 'unlock', 'force_submit', 'allow_back_in');--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"attempt_id" text,
	"actor_id" text,
	"kind" "incident_kind" NOT NULL,
	"message" text,
	"seconds" integer,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "extra_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_session_id_quiz_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."quiz_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incidents_session_id_at_idx" ON "incidents" USING btree ("session_id","at");