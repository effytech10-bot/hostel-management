CREATE TYPE "public"."payment_method" AS ENUM('cash', 'bkash', 'nagad', 'bank', 'other');--> statement-breakpoint
CREATE TABLE "payment_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"method" "payment_method" NOT NULL,
	"details" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"building_id" uuid,
	"receipt_no" text NOT NULL,
	"amount_paisa" bigint NOT NULL,
	"method" "payment_method" NOT NULL,
	"account_id" uuid NOT NULL,
	"trx_id" text,
	"paid_date" date NOT NULL,
	"note" text,
	"balance_before_paisa" bigint NOT NULL,
	"balance_after_paisa" bigint NOT NULL,
	"request_id" uuid NOT NULL,
	"received_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_paisa" > 0)
);
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_account_id_payment_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."payment_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_memberships_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_voided_by_memberships_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_accounts_org_name_uq" ON "payment_accounts" USING btree ("org_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_org_receipt_uq" ON "payments" USING btree ("org_id","receipt_no");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_org_request_uq" ON "payments" USING btree ("org_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_trx_uq" ON "payments" USING btree ("org_id","method","trx_id") WHERE "payments"."trx_id" IS NOT NULL AND "payments"."voided_at" IS NULL;--> statement-breakpoint
CREATE INDEX "payments_org_date_idx" ON "payments" USING btree ("org_id","paid_date");--> statement-breakpoint
CREATE INDEX "payments_student_idx" ON "payments" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "payments_building_date_idx" ON "payments" USING btree ("building_id","paid_date");