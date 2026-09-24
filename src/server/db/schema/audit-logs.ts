import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id } from "./columns";
import { memberships } from "./memberships";
import { organizations } from "./organizations";

/** Append-only history of important changes: who, when, what, before and after. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    actorMembershipId: uuid("actor_membership_id").references(() => memberships.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(), // e.g. "membership.create"
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_org_created_idx").on(t.orgId, t.createdAt),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
  ],
).enableRLS();
