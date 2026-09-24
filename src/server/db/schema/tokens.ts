import { index, integer, pgEnum, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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

/** Month-end meal settlement for one student: meals eaten × rates vs the deposit billed. */
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
    uniqueIndex("meal_settlements_student_period_uq").on(t.studentId, t.period),
    index("meal_settlements_org_period_idx").on(t.orgId, t.period),
  ],
).enableRLS();

export const tokenKinds = ["monthly", "admission"] as const;
export const tokenKind = pgEnum("token_kind", tokenKinds);

/**
 * The monthly bill as printed and shown to the student. A snapshot: the ledger stays the source of truth.
 * kind "admission" = the first bill made at admission (advance + first month); a student never gets both
 * an admission bill and a monthly token for the same month.
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
    kind: tokenKind("kind").notNull().default("monthly"),
    seatText: text("seat_text"),
    rentPaisa: paisa("rent_paisa").notNull(),
    currentTotalPaisa: paisa("current_total_paisa").notNull(),
    previousTotalPaisa: paisa("previous_total_paisa").notNull(),
    totalPaisa: paisa("total_paisa").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tokens_student_period_uq").on(t.studentId, t.period),
    index("tokens_org_period_idx").on(t.orgId, t.period),
    index("tokens_building_period_idx").on(t.buildingId, t.period),
  ],
).enableRLS();

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
    amountPaisa: paisa("amount_paisa").notNull(),
    sort: smallint("sort").notNull(),
  },
  (t) => [index("token_lines_token_idx").on(t.tokenId)],
).enableRLS();

export type Token = typeof tokens.$inferSelect;
export type TokenLineRow = typeof tokenLines.$inferSelect;
