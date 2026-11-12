CREATE TYPE "public"."finance_entry_kind" AS ENUM('expense', 'owner_withdraw', 'owner_deposit');--> statement-breakpoint
CREATE TYPE "public"."finance_fund" AS ENUM('rent', 'meal', 'service');--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expense_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "finance_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "finance_entry_kind" NOT NULL,
	"fund" "finance_fund" NOT NULL,
	"account_id" uuid NOT NULL,
	"building_id" uuid,
	"category_id" uuid,
	"voucher_no" text NOT NULL,
	"title" text NOT NULL,
	"amount_paisa" bigint NOT NULL,
	"entry_date" date NOT NULL,
	"note" text,
	"request_id" uuid,
	"reverses_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	CONSTRAINT "finance_entries_amount_sign" CHECK (("finance_entries"."reverses_id" IS NULL AND "finance_entries"."amount_paisa" > 0) OR ("finance_entries"."reverses_id" IS NOT NULL AND "finance_entries"."amount_paisa" < 0)),
	CONSTRAINT "finance_entries_category" CHECK (("finance_entries"."kind" = 'expense') = ("finance_entries"."category_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "finance_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "payment_order" text DEFAULT 'rent,meal,service' NOT NULL;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_account_id_payment_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."payment_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_reverses_id_finance_entries_id_fk" FOREIGN KEY ("reverses_id") REFERENCES "public"."finance_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_created_by_memberships_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_voided_by_memberships_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expense_categories_org_name_uq" ON "expense_categories" USING btree ("org_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "finance_entries_org_voucher_uq" ON "finance_entries" USING btree ("org_id","voucher_no");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_entries_org_request_uq" ON "finance_entries" USING btree ("org_id","request_id") WHERE "finance_entries"."request_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_entries_reverses_uq" ON "finance_entries" USING btree ("reverses_id") WHERE "finance_entries"."reverses_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "finance_entries_org_date_idx" ON "finance_entries" USING btree ("org_id","entry_date");--> statement-breakpoint
CREATE INDEX "finance_entries_org_fund_date_idx" ON "finance_entries" USING btree ("org_id","fund","entry_date");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_payment_order" CHECK ("organizations"."payment_order" in ('rent,meal,service','rent,service,meal','meal,rent,service','meal,service,rent','service,rent,meal','service,meal,rent'));