DROP INDEX "meal_settlements_student_period_uq";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "token_id" uuid;--> statement-breakpoint
ALTER TABLE "meal_settlements" ADD COLUMN "token_id" uuid;--> statement-breakpoint
ALTER TABLE "meal_settlements" ADD COLUMN "from_date" date;--> statement-breakpoint
ALTER TABLE "meal_settlements" ADD COLUMN "to_date" date;--> statement-breakpoint
ALTER TABLE "token_lines" ADD COLUMN "detail" text;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "early" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "meal_from" date;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "meal_to" date;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_created_by_memberships_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_token_idx" ON "payments" USING btree ("token_id");--> statement-breakpoint
CREATE INDEX "meal_settlements_student_idx" ON "meal_settlements" USING btree ("student_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_settlements_token_uq" ON "meal_settlements" USING btree ("token_id") WHERE "meal_settlements"."token_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tokens_org_code_uq" ON "tokens" USING btree ("org_id","code");