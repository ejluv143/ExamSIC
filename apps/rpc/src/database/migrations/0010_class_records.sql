CREATE TABLE "class_records" (
	"class_id" text PRIMARY KEY NOT NULL,
	"terms" jsonb NOT NULL,
	"scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"absences" jsonb NOT NULL,
	"dropped" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unlinked" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"signatories" jsonb NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_records" ADD CONSTRAINT "class_records_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_records" ADD CONSTRAINT "class_records_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;