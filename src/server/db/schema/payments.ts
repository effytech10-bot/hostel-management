import { sql } from "drizzle-orm";
import { boolean, check, date, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, paisa, timestamps } from "./columns";
import { memberships } from "./memberships";
import { organizations } from "./organizations";
import { buildings } from "./property";
import { students } from "./students";

export const paymentMethods = ["cash", "bkash", "nagad", "bank", "other"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];
export const paymentMethod = pgEnum("payment_method", paymentMethods);

/**
 * Where money is received: cash box, a bKash/Nagad number, a bank account.
 * Recording the account on every payment shows how much is sitting where.
 */
export const paymentAccounts = pgTable(
  "payment_accounts",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: text("name").notNull(), // "bKash 01867-271100 (Nayan)"
    method: paymentMethod("method").notNull(),
    details: text("details"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("payment_accounts_org_name_uq").on(t.orgId, t.name)],
).enableRLS();

/**
 * Money received from a student. Never edited or deleted: a wrong payment is VOIDED,
 * which keeps the receipt number and posts reversing ledger lines.
 * How the amount was split across dues is in ledger_entries (source_type = 'payment', source_id = id).
 */
export const payments = pgTable(
  "payments",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "restrict" }),
    receiptNo: text("receipt_no").notNull(),
    amountPaisa: paisa("amount_paisa").notNull(),
    method: paymentMethod("method").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => paymentAccounts.id, { onDelete: "restrict" }),
    trxId: text("trx_id"),
    paidDate: date("paid_date", { mode: "string" }).notNull(),
    note: text("note"),
    /** Balance (+ due / − credit) just before and just after this payment, printed on the receipt. */
    balanceBeforePaisa: paisa("balance_before_paisa").notNull(),
    balanceAfterPaisa: paisa("balance_after_paisa").notNull(),
    /** Sent by the form; a double click or a retried request cannot create a second payment. */
    requestId: uuid("request_id").notNull(),
    receivedBy: uuid("received_by").references(() => memberships.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => memberships.id, { onDelete: "set null" }),
    voidReason: text("void_reason"),
  },
  (t) => [
    uniqueIndex("payments_org_receipt_uq").on(t.orgId, t.receiptNo),
    uniqueIndex("payments_org_request_uq").on(t.orgId, t.requestId),
    uniqueIndex("payments_trx_uq")
      .on(t.orgId, t.method, t.trxId)
      .where(sql`${t.trxId} IS NOT NULL AND ${t.voidedAt} IS NULL`),
    index("payments_org_date_idx").on(t.orgId, t.paidDate),
    index("payments_student_idx").on(t.studentId),
    index("payments_building_date_idx").on(t.buildingId, t.paidDate),
    check("payments_amount_positive", sql`${t.amountPaisa} > 0`),
  ],
).enableRLS();

export type PaymentAccount = typeof paymentAccounts.$inferSelect;
export type Payment = typeof payments.$inferSelect;
