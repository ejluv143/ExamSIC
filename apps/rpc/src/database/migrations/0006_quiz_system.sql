CREATE TYPE "public"."asset_purpose" AS ENUM('question', 'answer');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('pending', 'ready');--> statement-breakpoint
CREATE TYPE "public"."attempt_status" AS ENUM('in_progress', 'needs_grading', 'graded');--> statement-breakpoint
CREATE TYPE "public"."game_phase" AS ENUM('lobby', 'question', 'reveal', 'leaderboard', 'ended');--> statement-breakpoint
CREATE TYPE "public"."game_points" AS ENUM('standard', 'double', 'none');--> statement-breakpoint
CREATE TYPE "public"."incident_kind" AS ENUM('pause', 'resume', 'add_time', 'warn', 'lock', 'unlock', 'force_submit', 'allow_back_in', 'device_switch_allowed', 'retake_granted');--> statement-breakpoint
CREATE TYPE "public"."integrity_event_type" AS ENUM('left_page', 'switched_app', 'alt_tab', 'mouse_left', 'window_resize', 'second_screen', 'exit_fullscreen', 'copy', 'paste', 'drop', 'bulk_input', 'right_click', 'print', 'screenshot', 'auto_submitted', 'late_submit', 'disconnected', 'device_changed', 'network_changed', 'shared_device', 'shared_network', 'too_fast', 'devtools_open', 'split_screen');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('multiple_choice', 'true_false', 'blank', 'matching', 'enumeration', 'numeric', 'essay', 'code', 'sql', 'drawing', 'categorization', 'ordering', 'hotspot');--> statement-breakpoint
CREATE TYPE "public"."results_release" AS ENUM('immediately', 'after_close', 'manual');--> statement-breakpoint
CREATE TYPE "public"."session_mode" AS ENUM('quiz', 'exam', 'mastery', 'game');--> statement-breakpoint
CREATE TYPE "public"."session_navigation" AS ENUM('free', 'marked_only', 'forward_only');--> statement-breakpoint
CREATE TYPE "public"."session_pacing" AS ENUM('teacher', 'student');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('scheduled', 'lobby', 'running', 'ended');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"purpose" "asset_purpose" NOT NULL,
	"s3_key" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer,
	"width" integer,
	"height" integer,
	"sha256" text,
	"status" "asset_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_s3_key_unique" UNIQUE("s3_key")
);
--> statement-breakpoint
CREATE TABLE "answer_history" (
	"id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL,
	"question_id" text NOT NULL,
	"value" jsonb,
	"saved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL,
	"question_id" text NOT NULL,
	"value" jsonb,
	"correct" boolean,
	"auto_score" double precision,
	"manual_score" double precision,
	"feedback" text,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"time_spent_ms" integer,
	"marked_for_review" boolean DEFAULT false NOT NULL,
	"shown_ms" integer DEFAULT 0 NOT NULL,
	"game_points_earned" integer,
	"time_ms" integer,
	"tries" integer DEFAULT 0 NOT NULL,
	"tries_log" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"student_id" text NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"seed" integer NOT NULL,
	"status" "attempt_status" DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"device_id" text,
	"ip" text,
	"last_seen_at" timestamp with time zone,
	"question_index" integer DEFAULT 0 NOT NULL,
	"furthest_index" integer DEFAULT 0 NOT NULL,
	"question_started_at" timestamp with time zone,
	"extra_ms" integer DEFAULT 0 NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"pledge_accepted_at" timestamp with time zone,
	"points" integer DEFAULT 0 NOT NULL,
	"game_streak" integer DEFAULT 0 NOT NULL,
	"mastery_queue" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text,
	"question" jsonb NOT NULL,
	"topic" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_results" (
	"answer_id" text PRIMARY KEY NOT NULL,
	"results" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grade_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"answer_id" text NOT NULL,
	"changed_by" text,
	"old_score" double precision,
	"new_score" double precision,
	"reason" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "integrity_events" (
	"id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL,
	"type" "integrity_event_type" NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" text PRIMARY KEY NOT NULL,
	"part_id" text NOT NULL,
	"position" integer NOT NULL,
	"type" "question_type" NOT NULL,
	"prompt" text NOT NULL,
	"topic" text,
	"points" double precision DEFAULT 1 NOT NULL,
	"game_points" "game_points" DEFAULT 'standard' NOT NULL,
	"partial_credit" boolean DEFAULT true NOT NULL,
	"body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_parts" (
	"id" text PRIMARY KEY NOT NULL,
	"quiz_id" text NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"shuffle_questions" boolean DEFAULT false NOT NULL,
	"pool_size" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"quiz_id" text NOT NULL,
	"class_id" text,
	"mode" "session_mode" DEFAULT 'quiz' NOT NULL,
	"pacing" "session_pacing" DEFAULT 'student' NOT NULL,
	"status" "session_status" DEFAULT 'scheduled' NOT NULL,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"time_limit_minutes" integer,
	"attempts_allowed" integer,
	"results_release" "results_release" DEFAULT 'immediately' NOT NULL,
	"results_released" boolean DEFAULT false NOT NULL,
	"integrity" jsonb NOT NULL,
	"mastery" jsonb,
	"exam" jsonb,
	"count_in_record" boolean DEFAULT true NOT NULL,
	"join_code" text,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"one_question_at_a_time" boolean DEFAULT false NOT NULL,
	"question_time_limit_seconds" integer,
	"navigation" "session_navigation" DEFAULT 'free' NOT NULL,
	"max_marked" integer,
	"late_join_minutes" integer,
	"room_password" text,
	"ip_allowlist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"paused_at" timestamp with time zone,
	"game_question_seconds" integer DEFAULT 20 NOT NULL,
	"game_leaderboard" boolean DEFAULT true NOT NULL,
	"game_streak_bonus" boolean DEFAULT true NOT NULL,
	"game_phase" "game_phase",
	"current_question_index" integer,
	"question_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"subject" text,
	"subject_area" text,
	"header" jsonb NOT NULL,
	"paper" jsonb NOT NULL,
	"settings" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_students" (
	"session_id" text NOT NULL,
	"student_id" text NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "session_students_session_id_student_id_pk" PRIMARY KEY("session_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "typing_edits" (
	"answer_id" text PRIMARY KEY NOT NULL,
	"edits" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_history" ADD CONSTRAINT "answer_history_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_history" ADD CONSTRAINT "answer_history_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_session_id_quiz_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."quiz_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_questions" ADD CONSTRAINT "bank_questions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_results" ADD CONSTRAINT "code_results_answer_id_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_changes" ADD CONSTRAINT "grade_changes_answer_id_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_changes" ADD CONSTRAINT "grade_changes_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_session_id_quiz_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."quiz_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrity_events" ADD CONSTRAINT "integrity_events_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_part_id_quiz_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."quiz_parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_parts" ADD CONSTRAINT "quiz_parts_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD CONSTRAINT "quiz_sessions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD CONSTRAINT "quiz_sessions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_students" ADD CONSTRAINT "session_students_session_id_quiz_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."quiz_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_students" ADD CONSTRAINT "session_students_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "typing_edits" ADD CONSTRAINT "typing_edits_answer_id_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_owner_id_idx" ON "assets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "assets_status_created_at_idx" ON "assets" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "answer_history_attempt_id_saved_at_idx" ON "answer_history" USING btree ("attempt_id","saved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "answers_attempt_id_question_id_unique" ON "answers" USING btree ("attempt_id","question_id");--> statement-breakpoint
CREATE INDEX "answers_question_id_idx" ON "answers" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attempts_session_student_number_unique" ON "attempts" USING btree ("session_id","student_id","attempt_number");--> statement-breakpoint
CREATE INDEX "attempts_student_id_idx" ON "attempts" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "bank_questions_owner_id_idx" ON "bank_questions" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "grade_changes_answer_id_idx" ON "grade_changes" USING btree ("answer_id");--> statement-breakpoint
CREATE INDEX "incidents_session_id_at_idx" ON "incidents" USING btree ("session_id","at");--> statement-breakpoint
CREATE INDEX "integrity_events_attempt_id_at_idx" ON "integrity_events" USING btree ("attempt_id","at");--> statement-breakpoint
CREATE INDEX "questions_part_id_position_idx" ON "questions" USING btree ("part_id","position");--> statement-breakpoint
CREATE INDEX "quiz_parts_quiz_id_position_idx" ON "quiz_parts" USING btree ("quiz_id","position");--> statement-breakpoint
CREATE INDEX "quiz_sessions_quiz_id_idx" ON "quiz_sessions" USING btree ("quiz_id");--> statement-breakpoint
CREATE INDEX "quiz_sessions_class_id_idx" ON "quiz_sessions" USING btree ("class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_sessions_join_code_active_unique" ON "quiz_sessions" USING btree ("join_code") WHERE "quiz_sessions"."status" <> 'ended';--> statement-breakpoint
CREATE INDEX "quizzes_owner_id_idx" ON "quizzes" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "session_students_student_id_idx" ON "session_students" USING btree ("student_id");