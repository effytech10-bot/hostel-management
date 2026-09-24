import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, paisa, timestamps } from "./columns";
import { memberships } from "./memberships";
import { organizations } from "./organizations";
import { buildings } from "./property";
import { students } from "./students";

export const midMonthRules = ["prorata", "full"] as const;
export const midMonthRule = pgEnum("mid_month_rule", midMonthRules);

/**
 * Rates for a billing month, set by the admin. A month without its own row uses the latest earlier month,
 * so the admin only has to save a month when something changes.
 */
export const billingRates = pgTable(
  "billing_rates",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    period: text("period").notNull(), // "YYYY-MM"
    breakfastRatePaisa: paisa("breakfast_rate_paisa").notNull(),
    lunchRatePaisa: paisa("lunch_rate_paisa").notNull(),
    dinnerRatePaisa: paisa("dinner_rate_paisa").notNull(),
    mealDepositPaisa: paisa("meal_deposit_paisa").notNull(),
    baburchiPaisa: paisa("baburchi_paisa").notNull(),
    serviceChargePaisa: paisa("service_charge_paisa").notNull(),
    /** Bill the yearly service charge in this month's token. */
    serviceChargeThisMonth: boolean("service_charge_this_month").notNull().default(false),
    /** Advance taken at admission = rent × this many months. */
    advanceMonths: smallint("advance_months").notNull().default(2),
    /** Joining or leaving mid-month: charge by days ("prorata") or the whole month ("full"). */
    midMonthRule: midMonthRule("mid_month_rule").notNull().default("prorata"),
    notes: text("notes"),
    updatedBy: uuid("updated_by").references(() => memberships.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("billing_rates_org_period_uq").on(t.orgId, t.period),
    check("billing_rates_period_format", sql`${t.period} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check(
      "billing_rates_non_negative",
      sql`${t.breakfastRatePaisa} >= 0 AND ${t.lunchRatePaisa} >= 0 AND ${t.dinnerRatePaisa} >= 0 AND ${t.mealDepositPaisa} >= 0 AND ${t.baburchiPaisa} >= 0 AND ${t.serviceChargePaisa} >= 0 AND ${t.advanceMonths} BETWEEN 0 AND 12`,
    ),
  ],
).enableRLS();

/** What a ledger line is for. Each head is a separate "pocket" of a student's account. */
export const ledgerHeads = ["rent", "meal", "baburchi", "service_charge", "advance", "other", "credit"] as const;
export type LedgerHead = (typeof ledgerHeads)[number];
export const ledgerHead = pgEnum("ledger_head", ledgerHeads);

/**
 * Every money movement on a student's account. Rows are never updated or deleted:
 * a mistake is corrected with a new, opposite row.
 *
 *   debit  = the student owes more (monthly charge, meal over-use)
 *   credit = the student owes less (payment, meal under-use)
 *   balance of a head = SUM(debit - credit); positive = due, negative = the student has credit.
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "restrict" }),
    period: text("period").notNull(), // billing month the line belongs to
    entryDate: date("entry_date", { mode: "string" }).notNull(),
    head: ledgerHead("head").notNull(),
    debitPaisa: paisa("debit_paisa").notNull().default(0),
    creditPaisa: paisa("credit_paisa").notNull().default(0),
    sourceType: text("source_type").notNull(), // token | payment | payment_void | meal_settlement | opening | adjustment
    sourceId: uuid("source_id"),
    description: text("description"),
    createdBy: uuid("created_by").references(() => memberships.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ledger_student_idx").on(t.studentId, t.period),
    index("ledger_org_period_idx").on(t.orgId, t.period),
    index("ledger_building_period_idx").on(t.buildingId, t.period),
    index("ledger_source_idx").on(t.sourceType, t.sourceId),
    check(
      "ledger_one_side",
      sql`${t.debitPaisa} >= 0 AND ${t.creditPaisa} >= 0 AND (${t.debitPaisa} = 0) <> (${t.creditPaisa} = 0)`,
    ),
    check("ledger_period_format", sql`${t.period} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
  ],
).enableRLS();

export type BillingRates = typeof billingRates.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
