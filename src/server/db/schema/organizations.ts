import { sql } from "drizzle-orm";
import { check, pgTable, smallint, text } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";

/**
 * One row per hostel business (tenant). Phase 1 has a single row (Rangdhanu),
 * but every business table carries org_id so the product can be sold to other hostels later.
 */
export const organizations = pgTable(
  "organizations",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    timezone: text("timezone").notNull().default("Asia/Dhaka"),
    currency: text("currency").notNull().default("BDT"),
    /**
     * Students can turn their own meals on/off until this hour (0-23, hostel time) of the day BEFORE the meal.
     * NULL = students cannot change meals; only the office can.
     */
    mealCutoffHour: smallint("meal_cutoff_hour").default(22),
    ...timestamps,
  },
  (t) => [check("organizations_meal_cutoff_hour_range", sql`${t.mealCutoffHour} between 0 and 23`)],
).enableRLS();

export type Organization = typeof organizations.$inferSelect;
