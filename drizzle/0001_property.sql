CREATE TABLE "buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text,
	"address" text,
	"landlord_name" text,
	"landlord_phone" text,
	"landlord_rent_paisa" bigint,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "buildings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "membership_buildings" (
	"org_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	CONSTRAINT "membership_buildings_membership_id_building_id_pk" PRIMARY KEY("membership_id","building_id")
);
--> statement-breakpoint
ALTER TABLE "membership_buildings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	"number" text NOT NULL,
	"floor" smallint,
	"default_rent_paisa" bigint,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_default_rent_non_negative" CHECK ("rooms"."default_rent_paisa" IS NULL OR "rooms"."default_rent_paisa" >= 0)
);
--> statement-breakpoint
ALTER TABLE "rooms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "seats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"label" text NOT NULL,
	"is_reserved" boolean DEFAULT false NOT NULL,
	"reserved_note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_buildings" ADD CONSTRAINT "membership_buildings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_buildings" ADD CONSTRAINT "membership_buildings_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_buildings" ADD CONSTRAINT "membership_buildings_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seats" ADD CONSTRAINT "seats_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seats" ADD CONSTRAINT "seats_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seats" ADD CONSTRAINT "seats_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "buildings_org_code_uq" ON "buildings" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX "membership_buildings_building_idx" ON "membership_buildings" USING btree ("building_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_building_number_uq" ON "rooms" USING btree ("building_id","number");--> statement-breakpoint
CREATE INDEX "rooms_org_idx" ON "rooms" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seats_room_label_uq" ON "seats" USING btree ("room_id","label");--> statement-breakpoint
CREATE INDEX "seats_building_idx" ON "seats" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "seats_org_idx" ON "seats" USING btree ("org_id");