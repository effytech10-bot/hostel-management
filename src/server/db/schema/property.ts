import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, primaryKey, smallint, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, paisa, timestamps } from "./columns";
import { memberships } from "./memberships";
import { organizations } from "./organizations";

/**
 * A rented house. Everything in the business is counted per building
 * (dues, income, expense, profit). Examples: "178", "178/A", "207".
 */
export const buildings = pgTable(
  "buildings",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name"),
    address: text("address"),
    landlordName: text("landlord_name"),
    landlordPhone: text("landlord_phone"),
    landlordRentPaisa: paisa("landlord_rent_paisa"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("buildings_org_code_uq").on(t.orgId, t.code)],
).enableRLS();

/**
 * A room inside a building. floor is derived from the room number when possible (601 -> 6)
 * and can be edited. default_rent_paisa pre-fills a new student's rent at admission.
 */
export const rooms = pgTable(
  "rooms",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "restrict" }),
    number: text("number").notNull(),
    floor: smallint("floor"),
    defaultRentPaisa: paisa("default_rent_paisa"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("rooms_building_number_uq").on(t.buildingId, t.number),
    index("rooms_org_idx").on(t.orgId),
    check("rooms_default_rent_non_negative", sql`${t.defaultRentPaisa} IS NULL OR ${t.defaultRentPaisa} >= 0`),
  ],
).enableRLS();

/**
 * A bed/seat in a room (A, B, C...). Whether it is occupied is NOT stored here:
 * it comes from the student's active seat assignment (next module), so it can never be out of sync.
 * is_reserved marks a seat held for someone who has not joined yet.
 */
export const seats = pgTable(
  "seats",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "restrict" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "restrict" }),
    label: text("label").notNull(),
    isReserved: boolean("is_reserved").notNull().default(false),
    reservedNote: text("reserved_note"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("seats_room_label_uq").on(t.roomId, t.label),
    index("seats_building_idx").on(t.buildingId),
    index("seats_org_idx").on(t.orgId),
  ],
).enableRLS();

/** Which buildings a cashier works in. Admins see every building and need no rows here. */
export const membershipBuildings = pgTable(
  "membership_buildings",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.membershipId, t.buildingId] }),
    index("membership_buildings_building_idx").on(t.buildingId),
  ],
).enableRLS();

export type Building = typeof buildings.$inferSelect;
export type Room = typeof rooms.$inferSelect;
export type Seat = typeof seats.$inferSelect;
