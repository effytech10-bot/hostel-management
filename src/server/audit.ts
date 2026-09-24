import "server-only";
import type { DbOrTx } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";

export type AuditEntry = {
  orgId: string;
  actorMembershipId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

/** Write an audit row. Call it inside the same transaction as the change. */
export async function writeAudit(tx: DbOrTx, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLogs).values({
    orgId: entry.orgId,
    actorMembershipId: entry.actorMembershipId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
