CREATE TABLE "meal_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"slot" "meal_slot" NOT NULL,
	"is_on" boolean NOT NULL,
	"from_date" date NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meal_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "meal_offs" ADD COLUMN "turned_on" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_preferences" ADD CONSTRAINT "meal_preferences_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_preferences" ADD CONSTRAINT "meal_preferences_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_preferences" ADD CONSTRAINT "meal_preferences_created_by_memberships_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meal_preferences_student_slot_from_uq" ON "meal_preferences" USING btree ("student_id","slot","from_date");--> statement-breakpoint
CREATE INDEX "meal_preferences_org_idx" ON "meal_preferences" USING btree ("org_id");