import { sql } from "drizzle-orm";
import { date, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id } from "./columns";
import { memberships } from "./memberships";
import { organizations } from "./organizations";
import { buildings } from "./property";
import { students } from "./students";

export const mealSlots = ["breakfast", "lunch", "dinner"] as const;
export type MealSlot = (typeof mealSlots)[number];
export const mealSlot = pgEnum("meal_slot", mealSlots);

/**
 * Meals are ON by default. Only the meals a student will NOT eat are stored.
 * building_id = the student's building on that date (for cashier access and reports).
 */
export const mealOffs = pgTable(
  "meal_offs",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "restrict" }),
    date: date("date", { mode: "string" }).notNull(),
    slot: mealSlot("slot").notNull(),
    createdBy: uuid("created_by").references(() => memberships.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("meal_offs_student_date_slot_uq").on(t.studentId, t.date, t.slot),
    index("meal_offs_org_date_idx").on(t.orgId, t.date),
    index("meal_offs_building_date_idx").on(t.buildingId, t.date),
  ],
).enableRLS();

/**
 * No meal for anyone (e.g. Eid, kitchen closed). building_id NULL = every building.
 */
export const mealHolidays = pgTable(
  "meal_holidays",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "restrict" }),
    date: date("date", { mode: "string" }).notNull(),
    slot: mealSlot("slot").notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => memberships.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("meal_holidays_all_uq")
      .on(t.orgId, t.date, t.slot)
      .where(sql`${t.buildingId} IS NULL`),
    uniqueIndex("meal_holidays_building_uq")
      .on(t.buildingId, t.date, t.slot)
      .where(sql`${t.buildingId} IS NOT NULL`),
    index("meal_holidays_org_date_idx").on(t.orgId, t.date),
  ],
).enableRLS();
