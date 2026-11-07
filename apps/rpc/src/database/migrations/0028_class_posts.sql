ALTER TABLE "class_announcements" ALTER COLUMN "body" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "class_announcements" ADD COLUMN "kind" text DEFAULT 'announcement' NOT NULL;--> statement-breakpoint
ALTER TABLE "class_announcements" ADD COLUMN "title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "class_announcements" ADD COLUMN "due_at" timestamp with time zone;