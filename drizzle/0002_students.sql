CREATE TYPE "public"."student_status" AS ENUM('active', 'left');--> statement-breakpoint
CREATE TABLE "org_counters" (
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" bigint NOT NULL,
	CONSTRAINT "org_counters_org_id_key_pk" PRIMARY KEY("org_id","key")
);
--> statement-breakpoint
ALTER TABLE "org_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "seat_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"seat_id" uuid NOT NULL,
	"rent_paisa" bigint NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"end_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seat_assignments_rent_non_negative" CHECK ("seat_assignments"."rent_paisa" >= 0),
	CONSTRAINT "seat_assignments_dates" CHECK ("seat_assignments"."end_date" IS NULL OR "seat_assignments"."end_date" >= "seat_assignments"."start_date")
);
--> statement-breakpoint
ALTER TABLE "seat_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"student_code" text NOT NULL,
	"full_name" text NOT NULL,
	"photo_path" text,
	"father_name" text,
	"phone" text NOT NULL,
	"guardian_phone" text,
	"permanent_address" text,
	"school" text,
	"college" text,
	"class_year" text,
	"group_name" text,
	"roll" text,
	"batch_id" uuid,
	"building_id" uuid,
	"status" "student_status" DEFAULT 'active' NOT NULL,
	"admission_date" date NOT NULL,
	"left_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_counters" ADD CONSTRAINT "org_counters_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_seat_id_seats_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seats"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "batches_org_name_uq" ON "batches" USING btree ("org_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "seat_assignments_one_active_per_seat" ON "seat_assignments" USING btree ("seat_id") WHERE "seat_assignments"."end_date" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "seat_assignments_one_active_per_student" ON "seat_assignments" USING btree ("student_id") WHERE "seat_assignments"."end_date" IS NULL;--> statement-breakpoint
CREATE INDEX "seat_assignments_student_idx" ON "seat_assignments" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "seat_assignments_building_active_idx" ON "seat_assignments" USING btree ("building_id") WHERE "seat_assignments"."end_date" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "students_org_code_uq" ON "students" USING btree ("org_id","student_code");--> statement-breakpoint
CREATE UNIQUE INDEX "students_membership_uq" ON "students" USING btree ("membership_id");--> statement-breakpoint
CREATE INDEX "students_org_status_idx" ON "students" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "students_building_idx" ON "students" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "students_batch_idx" ON "students" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "students_phone_idx" ON "students" USING btree ("org_id","phone");