CREATE TYPE "public"."token_line_kind" AS ENUM('current', 'previous');--> statement-breakpoint
CREATE TABLE "billing_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"period" text NOT NULL,
	"tokens_generated_at" timestamp with time zone,
	"tokens_count" integer DEFAULT 0 NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_periods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meal_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"building_id" uuid,
	"period" text NOT NULL,
	"breakfast" smallint NOT NULL,
	"lunch" smallint NOT NULL,
	"dinner" smallint NOT NULL,
	"cost_paisa" bigint NOT NULL,
	"deposit_paisa" bigint NOT NULL,
	"difference_paisa" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meal_settlements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "token_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"token_id" uuid NOT NULL,
	"kind" "token_line_kind" NOT NULL,
	"head" "ledger_head" NOT NULL,
	"label" text NOT NULL,
	"amount_paisa" bigint NOT NULL,
	"sort" smallint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "token_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"building_id" uuid,
	"period" text NOT NULL,
	"seat_text" text,
	"rent_paisa" bigint NOT NULL,
	"current_total_paisa" bigint NOT NULL,
	"previous_total_paisa" bigint NOT NULL,
	"total_paisa" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_periods" ADD CONSTRAINT "billing_periods_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_periods" ADD CONSTRAINT "billing_periods_closed_by_memberships_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_settlements" ADD CONSTRAINT "meal_settlements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_settlements" ADD CONSTRAINT "meal_settlements_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_settlements" ADD CONSTRAINT "meal_settlements_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_lines" ADD CONSTRAINT "token_lines_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_lines" ADD CONSTRAINT "token_lines_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_periods_org_period_uq" ON "billing_periods" USING btree ("org_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_settlements_student_period_uq" ON "meal_settlements" USING btree ("student_id","period");--> statement-breakpoint
CREATE INDEX "meal_settlements_org_period_idx" ON "meal_settlements" USING btree ("org_id","period");--> statement-breakpoint
CREATE INDEX "token_lines_token_idx" ON "token_lines" USING btree ("token_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tokens_student_period_uq" ON "tokens" USING btree ("student_id","period");--> statement-breakpoint
CREATE INDEX "tokens_org_period_idx" ON "tokens" USING btree ("org_id","period");--> statement-breakpoint
CREATE INDEX "tokens_building_period_idx" ON "tokens" USING btree ("building_id","period");