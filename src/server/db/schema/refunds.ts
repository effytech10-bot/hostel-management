import { sql } from "drizzle-orm";
import { check, date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, paisa } from "./columns";
import { memberships } from "./memberships";
import { organizations } from "./organizations";
import { paymentAccounts } from "./payments";
import { buildings } from "./property";
import { students } from "./students";

/** Money paid back to a student (usually when they leave and their advance is more than their dues). */
export const refunds = pgTable(
  "refunds",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "restrict" }),
    amountPaisa: paisa("amount_paisa").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => paymentAccounts.id, { onDelete: "restrict" }),
    paidDate: date("paid_date", { mode: "string" }).notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => memberships.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("refunds_org_date_idx").on(t.orgId, t.paidDate),
    index("refunds_student_idx").on(t.studentId),
    check("refunds_amount_positive", sql`${t.amountPaisa} > 0`),
  ],
).enableRLS();
