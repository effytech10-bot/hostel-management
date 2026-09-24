import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { ledgerEntries } from "@/server/db/schema";
import { balancesByHead, openDues, type LedgerHead } from "@/server/domain/billing";
import type { Paisa } from "@/lib/money";

export type NewLedgerEntry = {
  orgId: string;
  studentId: string;
  buildingId: string | null;
  period: string;
  entryDate: string;
  head: LedgerHead;
  /** Positive = debit (student owes more). Negative = credit (student owes less). */
  amountPaisa: Paisa;
  sourceType:
    | "token"
    | "admission"
    | "payment"
    | "payment_void"
    | "meal_settlement"
    | "opening"
    /** Money paid before the software started (e.g. advance already held), entered at import. */
    | "opening_payment"
    | "adjustment"
    | "netting"
    | "leave"
    | "refund";
  sourceId?: string | null;
  description?: string | null;
  createdBy?: string | null;
};

/** Post ledger rows. Zero amounts are skipped. Always call inside the transaction that makes the change. */
export async function postLedger(tx: DbOrTx, entries: NewLedgerEntry[]): Promise<void> {
  const rows = entries
    .filter((e) => e.amountPaisa !== 0)
    .map((e) => {
      if (!Number.isSafeInteger(e.amountPaisa))
        throw new Error(`Ledger amount must be integer paisa: ${e.amountPaisa}`);
      return {
        orgId: e.orgId,
        studentId: e.studentId,
        buildingId: e.buildingId,
        period: e.period,
        entryDate: e.entryDate,
        head: e.head,
        debitPaisa: e.amountPaisa > 0 ? e.amountPaisa : 0,
        creditPaisa: e.amountPaisa < 0 ? -e.amountPaisa : 0,
        sourceType: e.sourceType,
        sourceId: e.sourceId ?? null,
        description: e.description ?? null,
        createdBy: e.createdBy ?? null,
      };
    });
  if (rows.length) await tx.insert(ledgerEntries).values(rows);
}

/** All ledger rows of a student, oldest first. */
export async function studentLedger(tx: DbOrTx, orgId: string, studentId: string) {
  return tx
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.orgId, orgId), eq(ledgerEntries.studentId, studentId)))
    .orderBy(asc(ledgerEntries.entryDate), asc(ledgerEntries.createdAt));
}

/** Balance per head and open dues (oldest first) for one student. */
export async function studentAccount(tx: DbOrTx, orgId: string, studentId: string) {
  const lines = await studentLedger(tx, orgId, studentId);
  const balances = balancesByHead(lines);
  const totalPaisa = Object.values(balances).reduce((s, v) => s + (v ?? 0), 0);
  return { lines, balances, dues: openDues(lines), totalPaisa };
}
