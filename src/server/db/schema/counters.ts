import { bigint, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/**
 * Per-organization running numbers (student IDs now, receipt numbers later).
 * Incremented inside the same transaction as the row that uses the number,
 * so a failed save never leaves a gap.
 */
export const orgCounters = pgTable(
  "org_counters",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    key: text("key").notNull(),
    value: bigint("value", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.key] })],
).enableRLS();
