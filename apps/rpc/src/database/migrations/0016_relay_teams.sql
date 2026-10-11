CREATE TABLE "session_team_guesses" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"attempt_id" text,
	"guess" text NOT NULL,
	"correct" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_team_members" (
	"attempt_id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_team_questions" (
	"team_id" text NOT NULL,
	"question_id" text NOT NULL,
	"owner_attempt_id" text,
	"share_index" integer NOT NULL,
	"piece" integer,
	"board_index" integer NOT NULL,
	"rescuer_attempt_id" text,
	"rescue_value" jsonb,
	"rescue_correct" boolean,
	"rescue_points" integer DEFAULT 0 NOT NULL,
	"rescue_claimed_at" timestamp with time zone,
	CONSTRAINT "session_team_questions_team_id_question_id_pk" PRIMARY KEY("team_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "session_teams" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"password" text,
	"wrong_guesses" integer DEFAULT 0 NOT NULL,
	"solved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD COLUMN "relay" jsonb;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD COLUMN "relay_password" text;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD COLUMN "relay_clues" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "session_team_guesses" ADD CONSTRAINT "session_team_guesses_team_id_session_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."session_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_team_guesses" ADD CONSTRAINT "session_team_guesses_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_team_members" ADD CONSTRAINT "session_team_members_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_team_members" ADD CONSTRAINT "session_team_members_team_id_session_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."session_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_team_questions" ADD CONSTRAINT "session_team_questions_team_id_session_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."session_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_team_questions" ADD CONSTRAINT "session_team_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_team_questions" ADD CONSTRAINT "session_team_questions_owner_attempt_id_attempts_id_fk" FOREIGN KEY ("owner_attempt_id") REFERENCES "public"."attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_team_questions" ADD CONSTRAINT "session_team_questions_rescuer_attempt_id_attempts_id_fk" FOREIGN KEY ("rescuer_attempt_id") REFERENCES "public"."attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_teams" ADD CONSTRAINT "session_teams_session_id_quiz_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."quiz_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_team_guesses_team_id_idx" ON "session_team_guesses" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "session_team_members_team_id_idx" ON "session_team_members" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "session_team_questions_owner_idx" ON "session_team_questions" USING btree ("owner_attempt_id");--> statement-breakpoint
CREATE INDEX "session_teams_session_id_idx" ON "session_teams" USING btree ("session_id");