import { sql } from "drizzle-orm";
import { boolean, date, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id } from "./columns";
import { memberships } from "./memberships";
import { organizations } from "./organizations";
import { buildings } from "./property";
import { students } from "./students";

export const mealSlots = ["breakfast", "lunch", "dinner"] as const;
export type MealSlot = (typeof mealSlots)[number];
export const mealSlot = pgEnum("meal_slot", mealSlots);

/**
 * Day-by-day exceptions to a student's normal meals.
 * Normally a row means "this meal is OFF on this day". turned_on = true means the opposite:
 * ON on a day the meal is normally off (a student who turned breakfast off every day, but eats on one day).
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
    turnedOn: boolean("turned_on").notNull().default(false),
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

/**
 * A student's normal setting for a meal, from a date onwards (e.g. "no breakfast every day from 26 Sep").
 * The latest row on or before a date decides; with no row the meal is ON. Old rows stay as history;
 * changing it again before the new setting has started replaces that pending row.
 */
export const mealPreferences = pgTable(
  "meal_preferences",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    slot: mealSlot("slot").notNull(),
    isOn: boolean("is_on").notNull(),
    fromDate: date("from_date", { mode: "string" }).notNull(),
    createdBy: uuid("created_by").references(() => memberships.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("meal_preferences_student_slot_from_uq").on(t.studentId, t.slot, t.fromDate),
    index("meal_preferences_org_idx").on(t.orgId),
  ],
).enableRLS();
