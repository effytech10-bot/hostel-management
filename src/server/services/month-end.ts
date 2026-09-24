import "server-only";
import { and, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { currentPeriod, formatPeriod, periodEnd, periodStart, previousPeriod, type Period } from "@/lib/dates";
import type { Paisa } from "@/lib/money";
import { writeAudit } from "@/server/audit";
import { db, type DbOrTx } from "@/server/db/client";
import {
  billingPeriods,
  buildings,
  ledgerEntries,
  mealSettlements,
  rooms,
  seatAssignments,
  seats,
  students,
  tokenLines,
  tokens,
} from "@/server/db/schema";
import {
  buildToken,
  LEDGER_HEADS,
  mealSettlement,
  netCredits,
  type LedgerHead,
  type Token,
} from "@/server/domain/billing";
import { AppError } from "@/server/errors";
import { postLedger, type NewLedgerEntry } from "./ledger";
import { computeMealCounts } from "./meals";
import { getEffectiveRates } from "./rates";

// ---------------------------------------------------------------------------
// Plan (pure reads) — used for the preview and inside the run
// ---------------------------------------------------------------------------

export type PlannedSettlement = {
  studentId: string;
  studentCode: string;
  fullName: string;
  buildingId: string;
  buildingCode: string;
  seatText: string;
  breakfast: number;
  lunch: number;
  dinner: number;
  costPaisa: Paisa;
  depositPaisa: Paisa;
  differencePaisa: Paisa;
};

export type PlannedToken = {
  studentId: string;
  studentCode: string;
  fullName: string;
  buildingId: string;
  buildingCode: string;
  seatText: string;
  rentPaisa: Paisa;
  token: Token;
  transfers: { fromHead: LedgerHead; toHead: LedgerHead; amountPaisa: Paisa }[];
};

export type MonthEndPlan = {
  tokenPeriod: Period;
  closePeriod: Period;
  alreadyClosed: boolean;
  settlements: PlannedSettlement[];
  tokens: PlannedToken[];
  tokensAlreadyMade: number;
  /** Problems that stop the run. */
  blockers: string[];
};

type Balances = Map<string, Partial<Record<LedgerHead, Paisa>>>;

async function balancesByStudent(tx: DbOrTx, orgId: string): Promise<Balances> {
  const rows = await tx
    .select({
      studentId: ledgerEntries.studentId,
      head: ledgerEntries.head,
      balance: sql<number>`sum(${ledgerEntries.debitPaisa} - ${ledgerEntries.creditPaisa})`.mapWith(Number),
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.orgId, orgId))
    .groupBy(ledgerEntries.studentId, ledgerEntries.head);
  const map: Balances = new Map();
  for (const r of rows) {
    if (r.balance === 0) continue;
    const b = map.get(r.studentId) ?? {};
    b[r.head] = r.balance;
    map.set(r.studentId, b);
  }
  return map;
}

export async function planMonthEnd(tx: DbOrTx, orgId: string, tokenPeriod: Period): Promise<MonthEndPlan> {
  const closePeriod = previousPeriod(tokenPeriod);
  const blockers: string[] = [];

  if (tokenPeriod > currentPeriod()) {
    blockers.push(`Tokens for ${formatPeriod(tokenPeriod)} can only be made from the 1st of that month.`);
  }

  const periodRows = await tx
    .select()
    .from(billingPeriods)
    .where(and(eq(billingPeriods.orgId, orgId), inArray(billingPeriods.period, [closePeriod, tokenPeriod])));
  const closeRow = periodRows.find((p) => p.period === closePeriod);
  const tokenRow = periodRows.find((p) => p.period === tokenPeriod);
  if (tokenRow?.closedAt) blockers.push(`${formatPeriod(tokenPeriod)} is already closed.`);
  const alreadyClosed = !!closeRow?.closedAt;

  // 1. Meal settlement for the month being closed
  let settlements: PlannedSettlement[] = [];
  if (!alreadyClosed) {
    // Active students, plus those who left after this month (their later leave did not settle this month).
    const counts = (await computeMealCounts(tx, orgId, closePeriod, null)).filter(
      (c) => c.days > 0 && (c.status === "active" || (c.leftDate !== null && c.leftDate > periodEnd(closePeriod))),
    );
    const done = new Set(
      (
        await tx
          .select({ studentId: mealSettlements.studentId })
          .from(mealSettlements)
          .where(and(eq(mealSettlements.orgId, orgId), eq(mealSettlements.period, closePeriod)))
      ).map((r) => r.studentId),
    );
    const todo = counts.filter((c) => !done.has(c.studentId));
    if (todo.length > 0) {
      const closeRates = await getEffectiveRates(tx, orgId, closePeriod);
      if (!closeRates) {
        blockers.push(
          `Set the meal rates for ${formatPeriod(closePeriod)} in Settings first (needed to settle meals).`,
        );
      } else {
        const deposits = new Map(
          (
            await tx
              .select({
                studentId: ledgerEntries.studentId,
                total: sql<number>`sum(${ledgerEntries.debitPaisa})`.mapWith(Number),
              })
              .from(ledgerEntries)
              .where(
                and(
                  eq(ledgerEntries.orgId, orgId),
                  eq(ledgerEntries.period, closePeriod),
                  eq(ledgerEntries.head, "meal"),
                  inArray(ledgerEntries.sourceType, ["token", "admission"]),
                ),
              )
              .groupBy(ledgerEntries.studentId)
          ).map((r) => [r.studentId, r.total]),
        );
        settlements = todo.map((c) => {
          const s = mealSettlement({
            counts: c,
            depositPaisa: deposits.get(c.studentId) ?? 0,
            rates: closeRates.rates,
          });
          return {
            studentId: c.studentId,
            studentCode: c.studentCode,
            fullName: c.fullName,
            buildingId: c.buildingId,
            buildingCode: c.buildingCode,
            seatText: c.seatText,
            breakfast: c.breakfast,
            lunch: c.lunch,
            dinner: c.dinner,
            costPaisa: s.costPaisa,
            depositPaisa: s.depositPaisa,
            differencePaisa: s.differencePaisa,
          };
        });
      }
    }
  }

  // 2. Tokens for the new month
  const tokenRates = await getEffectiveRates(tx, orgId, tokenPeriod);
  if (!tokenRates) blockers.push(`Set the rates for ${formatPeriod(tokenPeriod)} in Settings first.`);

  const firstDay = periodStart(tokenPeriod);
  const eligible = await tx
    .select({
      studentId: students.id,
      studentCode: students.studentCode,
      fullName: students.fullName,
      buildingId: seatAssignments.buildingId,
      buildingCode: buildings.code,
      roomNumber: rooms.number,
      seatLabel: seats.label,
      rentPaisa: seatAssignments.rentPaisa,
    })
    .from(seatAssignments)
    .innerJoin(students, eq(students.id, seatAssignments.studentId))
    .innerJoin(buildings, eq(buildings.id, seatAssignments.buildingId))
    .innerJoin(rooms, eq(rooms.id, seatAssignments.roomId))
    .innerJoin(seats, eq(seats.id, seatAssignments.seatId))
    .where(
      and(
        eq(seatAssignments.orgId, orgId),
        eq(students.status, "active"),
        lte(seatAssignments.startDate, firstDay),
        or(isNull(seatAssignments.endDate), gt(seatAssignments.endDate, firstDay)),
      ),
    );

  const made = new Set(
    (
      await tx
        .select({ studentId: tokens.studentId })
        .from(tokens)
        .where(and(eq(tokens.orgId, orgId), eq(tokens.period, tokenPeriod)))
    ).map((r) => r.studentId),
  );

  let plannedTokens: PlannedToken[] = [];
  if (tokenRates) {
    const balances = await balancesByStudent(tx, orgId);
    // Include this run's meal settlements in "previous balance".
    for (const s of settlements) {
      if (s.differencePaisa === 0) continue;
      const b = balances.get(s.studentId) ?? {};
      b.meal = (b.meal ?? 0) + s.differencePaisa;
      if (b.meal === 0) delete b.meal;
      balances.set(s.studentId, b);
    }

    plannedTokens = eligible
      .filter((e) => !made.has(e.studentId))
      .map((e) => {
        const previous = balances.get(e.studentId) ?? {};
        const token = buildToken({ rentPaisa: e.rentPaisa, rates: tokenRates.rates, previousBalances: previous });
        const after: Partial<Record<LedgerHead, Paisa>> = { ...previous };
        for (const line of token.current) after[line.head] = (after[line.head] ?? 0) + line.amountPaisa;
        return {
          studentId: e.studentId,
          studentCode: e.studentCode,
          fullName: e.fullName,
          buildingId: e.buildingId,
          buildingCode: e.buildingCode,
          seatText: `${e.roomNumber}-${e.seatLabel}`,
          rentPaisa: e.rentPaisa,
          token,
          transfers: netCredits(after),
        };
      })
      .sort(
        (a, b) =>
          a.buildingCode.localeCompare(b.buildingCode, "en", { numeric: true }) ||
          a.seatText.localeCompare(b.seatText, "en", { numeric: true }),
      );
  }

  return {
    tokenPeriod,
    closePeriod,
    alreadyClosed,
    settlements,
    tokens: plannedTokens,
    tokensAlreadyMade: made.size,
    blockers,
  };
}

// ---------------------------------------------------------------------------
// Run: close the previous month and make this month's tokens, all in one transaction
// ---------------------------------------------------------------------------

export type MonthEndResult = { closedPeriod: Period | null; settled: number; tokensMade: number; tokenPeriod: Period };

export async function runMonthEnd(
  orgId: string,
  tokenPeriod: Period,
  actorMembershipId: string | null,
): Promise<MonthEndResult> {
  const closePeriod = previousPeriod(tokenPeriod);

  return db().transaction(async (tx) => {
    // Lock both month rows so two runs (cron + admin click) cannot overlap.
    await tx
      .insert(billingPeriods)
      .values([
        { orgId, period: closePeriod },
        { orgId, period: tokenPeriod },
      ])
      .onConflictDoNothing();
    await tx
      .select({ id: billingPeriods.id })
      .from(billingPeriods)
      .where(and(eq(billingPeriods.orgId, orgId), inArray(billingPeriods.period, [closePeriod, tokenPeriod])))
      .for("update");

    const plan = await planMonthEnd(tx, orgId, tokenPeriod);
    if (plan.blockers.length) throw new AppError("VALIDATION", plan.blockers.join(" "));

    const ledger: NewLedgerEntry[] = [];

    // 1. Settle meals and close the previous month
    if (!plan.alreadyClosed) {
      if (plan.settlements.length) {
        const inserted = await tx
          .insert(mealSettlements)
          .values(
            plan.settlements.map((s) => ({
              orgId,
              studentId: s.studentId,
              buildingId: s.buildingId,
              period: closePeriod,
              breakfast: s.breakfast,
              lunch: s.lunch,
              dinner: s.dinner,
              costPaisa: s.costPaisa,
              depositPaisa: s.depositPaisa,
              differencePaisa: s.differencePaisa,
            })),
          )
          .returning({ id: mealSettlements.id, studentId: mealSettlements.studentId });
        const idByStudent = new Map(inserted.map((r) => [r.studentId, r.id]));
        for (const s of plan.settlements) {
          ledger.push({
            orgId,
            studentId: s.studentId,
            buildingId: s.buildingId,
            period: closePeriod,
            entryDate: periodEnd(closePeriod),
            head: "meal",
            amountPaisa: s.differencePaisa,
            sourceType: "meal_settlement",
            sourceId: idByStudent.get(s.studentId),
            description: `Meals ${formatPeriod(closePeriod)}: cost ${s.costPaisa / 100} vs deposit ${s.depositPaisa / 100}`,
            createdBy: actorMembershipId,
          });
        }
      }
      await tx
        .update(billingPeriods)
        .set({ closedAt: new Date(), closedBy: actorMembershipId })
        .where(and(eq(billingPeriods.orgId, orgId), eq(billingPeriods.period, closePeriod)));
    }

    // 2. Tokens
    if (plan.tokens.length) {
      const inserted = await tx
        .insert(tokens)
        .values(
          plan.tokens.map((t) => ({
            orgId,
            studentId: t.studentId,
            buildingId: t.buildingId,
            period: tokenPeriod,
            seatText: `${t.buildingCode} · ${t.seatText}`,
            rentPaisa: t.rentPaisa,
            currentTotalPaisa: t.token.currentTotalPaisa,
            previousTotalPaisa: t.token.previousTotalPaisa,
            totalPaisa: t.token.totalPaisa,
          })),
        )
        .returning({ id: tokens.id, studentId: tokens.studentId });
      const tokenIdByStudent = new Map(inserted.map((r) => [r.studentId, r.id]));

      await tx.insert(tokenLines).values(
        plan.tokens.flatMap((t) => {
          const tokenId = tokenIdByStudent.get(t.studentId)!;
          return [
            ...t.token.current.map((l, i) => ({
              orgId,
              tokenId,
              kind: "current" as const,
              head: l.head,
              label: l.label,
              amountPaisa: l.amountPaisa,
              sort: i,
            })),
            ...t.token.previous.map((l, i) => ({
              orgId,
              tokenId,
              kind: "previous" as const,
              head: l.head,
              label: l.label,
              amountPaisa: l.amountPaisa,
              sort: 100 + LEDGER_HEADS.indexOf(l.head) + i,
            })),
          ];
        }),
      );

      for (const t of plan.tokens) {
        const base = {
          orgId,
          studentId: t.studentId,
          buildingId: t.buildingId,
          period: tokenPeriod,
          entryDate: periodStart(tokenPeriod),
          sourceId: tokenIdByStudent.get(t.studentId),
          createdBy: actorMembershipId,
        };
        for (const line of t.token.current) {
          ledger.push({
            ...base,
            head: line.head,
            amountPaisa: line.amountPaisa,
            sourceType: "token",
            description: line.label,
          });
        }
        // Money the student already has with the hostel pays this month's dues.
        for (const tr of t.transfers) {
          ledger.push({
            ...base,
            head: tr.toHead,
            amountPaisa: -tr.amountPaisa,
            sourceType: "netting",
            description: `Paid from ${tr.fromHead}`,
          });
          ledger.push({
            ...base,
            head: tr.fromHead,
            amountPaisa: tr.amountPaisa,
            sourceType: "netting",
            description: `Used for ${tr.toHead}`,
          });
        }
      }
    }

    await postLedger(tx, ledger);

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(tokens)
      .where(and(eq(tokens.orgId, orgId), eq(tokens.period, tokenPeriod)));
    await tx
      .update(billingPeriods)
      .set({ tokensGeneratedAt: new Date(), tokensCount: count })
      .where(and(eq(billingPeriods.orgId, orgId), eq(billingPeriods.period, tokenPeriod)));

    await writeAudit(tx, {
      orgId,
      actorMembershipId,
      action: "billing.month_end",
      entityType: "billing_period",
      entityId: tokenPeriod,
      after: {
        closedPeriod: plan.alreadyClosed ? null : closePeriod,
        settled: plan.settlements.length,
        tokensMade: plan.tokens.length,
        byCron: actorMembershipId === null,
      },
    });

    return {
      closedPeriod: plan.alreadyClosed ? null : closePeriod,
      settled: plan.settlements.length,
      tokensMade: plan.tokens.length,
      tokenPeriod,
    };
  });
}
