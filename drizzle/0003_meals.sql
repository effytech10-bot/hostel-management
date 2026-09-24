CREATE TYPE "public"."meal_slot" AS ENUM('breakfast', 'lunch', 'dinner');--> statement-breakpoint
CREATE TABLE "meal_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"building_id" uuid,
	"date" date NOT NULL,
	"slot" "meal_slot" NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meal_holidays" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meal_offs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	"date" date NOT NULL,
	"slot" "meal_slot" NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meal_offs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "meal_holidays" ADD CONSTRAINT "meal_holidays_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_holidays" ADD CONSTRAINT "meal_holidays_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_holidays" ADD CONSTRAINT "meal_holidays_created_by_memberships_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_offs" ADD CONSTRAINT "meal_offs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_offs" ADD CONSTRAINT "meal_offs_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_offs" ADD CONSTRAINT "meal_offs_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_offs" ADD CONSTRAINT "meal_offs_created_by_memberships_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meal_holidays_all_uq" ON "meal_holidays" USING btree ("org_id","date","slot") WHERE "meal_holidays"."building_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "meal_holidays_building_uq" ON "meal_holidays" USING btree ("building_id","date","slot") WHERE "meal_holidays"."building_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "meal_holidays_org_date_idx" ON "meal_holidays" USING btree ("org_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_offs_student_date_slot_uq" ON "meal_offs" USING btree ("student_id","date","slot");--> statement-breakpoint
CREATE INDEX "meal_offs_org_date_idx" ON "meal_offs" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX "meal_offs_building_date_idx" ON "meal_offs" USING btree ("building_id","date");