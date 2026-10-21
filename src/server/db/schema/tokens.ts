import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, paisa } from "./columns";
import { ledgerHead } from "./billing";
import { memberships } from "./memberships";
import { organizations } from "./organizations";
import { buildings } from "./property";
import { students } from "./students";

/**
 * One row per organization and month.
 * closed_at: meals were settled and the month is locked (no more changes to its meals, payments, rates).
 * tokens_generated_at: monthly tokens were created for this month.
 */
export const billingPeriods = pgTable(
  "billing_periods",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    period: text("period").notNull(),
    tokensGeneratedAt: timestamp("tokens_generated_at", { withTimezone: true }),
    tokensCount: integer("tokens_count").notNull().default(0),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: uuid("closed_by").references(() => memberships.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("billing_periods_org_period_uq").on(t.orgId, t.period)],
).enableRLS();

/**
 * Meal settlement for one student over a range of days ("pre meal" on a token):
 * meals eaten × rates vs the meal money already billed on the previous token.
 * token_id = the token that shows it; NULL when it was made on leaving.
 */
export const mealSettlements = pgTable(
  "meal_settlements",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "restrict" }),
    period: text("period").notNull(),
    tokenId: uuid("token_id"),
    fromDate: date("from_date", { mode: "string" }),
    toDate: date("to_date", { mode: "string" }),
    breakfast: smallint("breakfast").notNull(),
    lunch: smallint("lunch").notNull(),
    dinner: smallint("dinner").notNull(),
    costPaisa: paisa("cost_paisa").notNull(),
    depositPaisa: paisa("deposit_paisa").notNull(),
    /** cost − deposit: + the student owes more, − the student gets credit. */
    differencePaisa: paisa("difference_paisa").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("meal_settlements_student_idx").on(t.studentId, t.period),
    uniqueIndex("meal_settlements_token_uq")
      .on(t.tokenId)
      .where(sql`${t.tokenId} IS NOT NULL`),
    index("meal_settlements_org_period_idx").on(t.orgId, t.period),
  ],
).enableRLS();

export const tokenKinds = ["monthly", "admission"] as const;
export const tokenKind = pgEnum("token_kind", tokenKinds);

/**
 * A token = the month's bill AND where its payments are recorded. One per student per month.
 * A snapshot of what was asked; the ledger stays the source of truth for what is still due.
 * kind "admission" = the first token, made at admission for the month after (with the rest of the
 * admission month, advance and service charge as dues). early = made by the admin before the 1st.
 * meal_from..meal_to = the days whose meals are settled on this token ("pre meal").
 */
export const tokens = pgTable(
  "tokens",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "restrict" }),
    period: text("period").notNull(),
    /** Human token ID, e.g. 2611-207601A-001 (year+month, building+room+seat, last 3 of Student ID). */
    code: text("code"),
    kind: tokenKind("kind").notNull().default("monthly"),
    early: boolean("early").notNull().default(false),
    mealFrom: date("meal_from", { mode: "string" }),
    mealTo: date("meal_to", { mode: "string" }),
    createdBy: uuid("created_by").references(() => memberships.id, { onDelete: "set null" }),
    seatText: text("seat_text"),
    rentPaisa: paisa("rent_paisa").notNull(),
    currentTotalPaisa: paisa("current_total_paisa").notNull(),
    previousTotalPaisa: paisa("previous_total_paisa").notNull(),
    totalPaisa: paisa("total_paisa").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tokens_student_period_uq").on(t.studentId, t.period),
    uniqueIndex("tokens_org_code_uq").on(t.orgId, t.code),
    index("tokens_org_period_idx").on(t.orgId, t.period),
    index("tokens_building_period_idx").on(t.buildingId, t.period),
  ],
).enableRLS();

/** current = "this month", previous = "due" (what was still owed when the token was made). */
export const tokenLineKinds = ["current", "previous"] as const;
export const tokenLineKind = pgEnum("token_line_kind", tokenLineKinds);

export const tokenLines = pgTable(
  "token_lines",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    tokenId: uuid("token_id")
      .notNull()
      .references(() => tokens.id, { onDelete: "cascade" }),
    kind: tokenLineKind("kind").notNull(),
    head: ledgerHead("head").notNull(),
    label: text("label").notNull(),
    /** Extra info shown under the label, e.g. the days it covers ("25 – 30 Sep"). */
    detail: text("detail"),
    amountPaisa: paisa("amount_paisa").notNull(),
    sort: smallint("sort").notNull(),
  },
  (t) => [index("token_lines_token_idx").on(t.tokenId)],
).enableRLS();

export type Token = typeof tokens.$inferSelect;
export type TokenLineRow = typeof tokenLines.$inferSelect;
