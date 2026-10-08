CREATE TABLE "class_meetings" (
	"class_id" text NOT NULL,
	"date" date NOT NULL,
	"records" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"taken_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_meetings_class_id_date_pk" PRIMARY KEY("class_id","date")
);
--> statement-breakpoint
ALTER TABLE "class_meetings" ADD CONSTRAINT "class_meetings_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_meetings" ADD CONSTRAINT "class_meetings_taken_by_users_id_fk" FOREIGN KEY ("taken_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;