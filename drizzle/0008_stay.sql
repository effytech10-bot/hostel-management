CREATE TYPE "public"."mid_month_rule" AS ENUM('prorata', 'full');--> statement-breakpoint
CREATE TYPE "public"."token_kind" AS ENUM('monthly', 'admission');--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"building_id" uuid,
	"amount_paisa" bigint NOT NULL,
	"account_id" uuid NOT NULL,
	"paid_date" date NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_amount_positive" CHECK ("refunds"."amount_paisa" > 0)
);
--> statement-breakpoint
ALTER TABLE "refunds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_rates" ADD COLUMN "mid_month_rule" "mid_month_rule" DEFAULT 'prorata' NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "kind" "token_kind" DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_account_id_payment_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."payment_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_created_by_memberships_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refunds_org_date_idx" ON "refunds" USING btree ("org_id","paid_date");--> statement-breakpoint
CREATE INDEX "refunds_student_idx" ON "refunds" USING btree ("student_id");