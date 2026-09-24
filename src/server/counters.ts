import "server-only";
import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { orgCounters } from "@/server/db/schema";

/**
 * Next number for (org, key). Call inside the transaction that uses the number:
 * the row lock serializes concurrent callers and a rollback gives the number back.
 * The first call returns `start`.
 */
export async function nextCounter(tx: DbOrTx, orgId: string, key: string, start: number): Promise<number> {
  const [row] = await tx
    .insert(orgCounters)
    .values({ orgId, key, value: start })
    .onConflictDoUpdate({
      target: [orgCounters.orgId, orgCounters.key],
      set: { value: sql`${orgCounters.value} + 1` },
    })
    .returning({ value: orgCounters.value });
  return row.value;
}
