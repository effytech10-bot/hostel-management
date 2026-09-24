CREATE TYPE "public"."ledger_head" AS ENUM('rent', 'meal', 'baburchi', 'service_charge', 'advance', 'other', 'credit');--> statement-breakpoint
CREATE TABLE "billing_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"period" text NOT NULL,
	"breakfast_rate_paisa" bigint NOT NULL,
	"lunch_rate_paisa" bigint NOT NULL,
	"dinner_rate_paisa" bigint NOT NULL,
	"meal_deposit_paisa" bigint NOT NULL,
	"baburchi_paisa" bigint NOT NULL,
	"service_charge_paisa" bigint NOT NULL,
	"service_charge_this_month" boolean DEFAULT false NOT NULL,
	"advance_months" smallint DEFAULT 2 NOT NULL,
	"notes" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_rates_period_format" CHECK ("billing_rates"."period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "billing_rates_non_negative" CHECK ("billing_rates"."breakfast_rate_paisa" >= 0 AND "billing_rates"."lunch_rate_paisa" >= 0 AND "billing_rates"."dinner_rate_paisa" >= 0 AND "billing_rates"."meal_deposit_paisa" >= 0 AND "billing_rates"."baburchi_paisa" >= 0 AND "billing_rates"."service_charge_paisa" >= 0 AND "billing_rates"."advance_months" BETWEEN 0 AND 12)
);
--> statement-breakpoint
ALTER TABLE "billing_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"building_id" uuid,
	"period" text NOT NULL,
	"entry_date" date NOT NULL,
	"head" "ledger_head" NOT NULL,
	"debit_paisa" bigint DEFAULT 0 NOT NULL,
	"credit_paisa" bigint DEFAULT 0 NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid,
	"description" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_one_side" CHECK ("ledger_entries"."debit_paisa" >= 0 AND "ledger_entries"."credit_paisa" >= 0 AND ("ledger_entries"."debit_paisa" = 0) <> ("ledger_entries"."credit_paisa" = 0)),
	CONSTRAINT "ledger_period_format" CHECK ("ledger_entries"."period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_rates" ADD CONSTRAINT "billing_rates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_rates" ADD CONSTRAINT "billing_rates_updated_by_memberships_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_created_by_memberships_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_rates_org_period_uq" ON "billing_rates" USING btree ("org_id","period");--> statement-breakpoint
CREATE INDEX "ledger_student_idx" ON "ledger_entries" USING btree ("student_id","period");--> statement-breakpoint
CREATE INDEX "ledger_org_period_idx" ON "ledger_entries" USING btree ("org_id","period");--> statement-breakpoint
CREATE INDEX "ledger_building_period_idx" ON "ledger_entries" USING btree ("building_id","period");--> statement-breakpoint
CREATE INDEX "ledger_source_idx" ON "ledger_entries" USING btree ("source_type","source_id");