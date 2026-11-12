import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { id, paisa, timestamps } from "./columns";
import { memberships } from "./memberships";
import { organizations } from "./organizations";
import { paymentAccounts } from "./payments";
import { buildings } from "./property";

/**
 * The hostel keeps its money in three accounts ("funds"):
 *   rent    = rent and advance        meal = meal money        service = service charge and other charges
 * Which account a student's payment went to is NOT stored here: it follows from the ledger head the money
 * was credited to (see domain/finance.ts). This file holds what the ledger does not know: money going out.
 */
export const funds = ["rent", "meal", "service"] as const;
export const fund = pgEnum("finance_fund", funds);

/** Expense categories ("Bazar", "Baburchi salary", "House rent"...). Made by the admin while typing an expense. */
export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("expense_categories_org_name_uq").on(t.orgId, sql`lower(${t.name})`)],
).enableRLS();

/**
 * expense        = money spent (bazar, salary, house rent...)
 * owner_withdraw = the owner took money out (not an expense: profit is not changed)
 * owner_deposit  = the owner put money in (not income)
 */
export const financeEntryKinds = ["expense", "owner_withdraw", "owner_deposit"] as const;
export type FinanceEntryKind = (typeof financeEntryKinds)[number];
export const financeEntryKind = pgEnum("finance_entry_kind", financeEntryKinds);

/**
 * Money moving in or out of an account that is not a student payment.
 * Rows are never edited or deleted. A wrong entry is VOIDED: the original gets voided_at and a second row
 * with the opposite amount (reverses_id = the original) is added on the day of the void, so every total is
 * a plain SUM(amount_paisa) and a closed month never changes.
 */
export const financeEntries = pgTable(
  "finance_entries",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    kind: financeEntryKind("kind").notNull(),
    fund: fund("fund").notNull(),
    /** Where the money physically came from / went to: cash box, bKash, bank. */
    accountId: uuid("account_id")
      .notNull()
      .references(() => paymentAccounts.id, { onDelete: "restrict" }),
    buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id").references(() => expenseCategories.id, { onDelete: "restrict" }),
    voucherNo: text("voucher_no").notNull(),
    title: text("title").notNull(),
    /** Positive. Negative only on the reversing row of a void. */
    amountPaisa: paisa("amount_paisa").notNull(),
    entryDate: date("entry_date", { mode: "string" }).notNull(),
    note: text("note"),
    /** Sent by the form; a double click cannot save the expense twice. */
    requestId: uuid("request_id"),
    reversesId: uuid("reverses_id").references((): AnyPgColumn => financeEntries.id, { onDelete: "restrict" }),
    createdBy: uuid("created_by").references(() => memberships.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => memberships.id, { onDelete: "set null" }),
    voidReason: text("void_reason"),
  },
  (t) => [
    uniqueIndex("finance_entries_org_voucher_uq").on(t.orgId, t.voucherNo),
    uniqueIndex("finance_entries_org_request_uq")
      .on(t.orgId, t.requestId)
      .where(sql`${t.requestId} IS NOT NULL`),
    // One reversal per entry: a second void of the same entry cannot be saved.
    uniqueIndex("finance_entries_reverses_uq")
      .on(t.reversesId)
      .where(sql`${t.reversesId} IS NOT NULL`),
    index("finance_entries_org_date_idx").on(t.orgId, t.entryDate),
    index("finance_entries_org_fund_date_idx").on(t.orgId, t.fund, t.entryDate),
    check(
      "finance_entries_amount_sign",
      sql`(${t.reversesId} IS NULL AND ${t.amountPaisa} > 0) OR (${t.reversesId} IS NOT NULL AND ${t.amountPaisa} < 0)`,
    ),
    check("finance_entries_category", sql`(${t.kind} = 'expense') = (${t.categoryId} IS NOT NULL)`),
  ],
).enableRLS();

export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type FinanceEntry = typeof financeEntries.$inferSelect;
