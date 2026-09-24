import "server-only";
import { and, count, eq, gte, inArray, lt, isNull } from "drizzle-orm";
import { formatPeriod, periodStart, previousPeriod, type Period } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import { assertRole, type SessionUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { ledgerEntries, memberships, seatAssignments, students, tokens } from "@/server/db/schema";
import { formatHour } from "@/server/domain/meals";
import { getCashierBuildingMap, listBuildings } from "./buildings";
import { getMealCutoffHour } from "./org-settings";
import { listPaymentAccounts } from "./payments";
import { latestClosedPeriod } from "./periods";
import { getEffectiveRates } from "./rates";

export type GoLiveStep = {
  title: string;
  status: "done" | "todo" | "warn";
  detail: string;
  href?: string;
  action?: string;
};

/** Everything that must be ready before the real hostel starts using the software from `start`. */
export async function goLiveChecklist(actor: SessionUser, start: Period): Promise<GoLiveStep[]> {
  assertRole(actor, "admin");
  const orgId = actor.orgId;
  const startDate = periodStart(start);
  const opening = previousPeriod(start);

  const [
    buildingList,
    rates,
    accounts,
    cutoff,
    cashiers,
    cashierMap,
    [activeStudents],
    [earlySeats],
    [startSeats],
    [openingLines],
    lastClosed,
    [startTokens],
  ] = await Promise.all([
    listBuildings(actor),
    getEffectiveRates(db(), orgId, start),
    listPaymentAccounts(actor),
    getMealCutoffHour(db(), orgId),
    db()
      .select({ id: memberships.id, fullName: memberships.fullName })
      .from(memberships)
      .where(and(eq(memberships.orgId, orgId), eq(memberships.role, "cashier"), eq(memberships.isActive, true))),
    getCashierBuildingMap(actor),
    db()
      .select({ n: count() })
      .from(students)
      .where(and(eq(students.orgId, orgId), eq(students.status, "active"))),
    db()
      .select({ n: count() })
      .from(seatAssignments)
      .where(
        and(
          eq(seatAssignments.orgId, orgId),
          isNull(seatAssignments.endDate),
          lt(seatAssignments.startDate, startDate),
        ),
      ),
    db()
      .select({ n: count() })
      .from(seatAssignments)
      .where(
        and(
          eq(seatAssignments.orgId, orgId),
          isNull(seatAssignments.endDate),
          gte(seatAssignments.startDate, startDate),
        ),
      ),
    db()
      .select({ n: count() })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.orgId, orgId), inArray(ledgerEntries.sourceType, ["opening", "opening_payment"]))),
    latestClosedPeriod(db(), orgId),
    db()
      .select({ n: count() })
      .from(tokens)
      .where(and(eq(tokens.orgId, orgId), eq(tokens.period, start))),
  ]);

  const seats = buildingList.reduce((s, b) => s + b.seats, 0);
  const rooms = buildingList.reduce((s, b) => s + b.rooms, 0);
  const nonCash = accounts.filter((a) => a.method !== "cash");
  const cashiersWithout = cashiers.filter((c) => !cashierMap.get(c.id)?.length);

  const steps: GoLiveStep[] = [
    {
      title: "Buildings, rooms and seats",
      status: seats > 0 ? "done" : "todo",
      detail:
        seats > 0
          ? `${buildingList.length} buildings · ${rooms} rooms · ${seats} seats. The import also creates missing ones.`
          : "Add them in Buildings, or let the Excel import create them.",
      href: "/admin/buildings",
      action: "Buildings",
    },
    {
      title: `Rates for ${formatPeriod(start)}`,
      status: rates ? "done" : "todo",
      detail: rates
        ? `Meal ${formatTaka(rates.rates.lunchRatePaisa)} (lunch/dinner), deposit ${formatTaka(rates.rates.mealDepositPaisa)}, baburchi ${formatTaka(rates.rates.baburchiPaisa)}${rates.fromPeriod !== start ? ` (from ${formatPeriod(rates.fromPeriod)})` : ""}.`
        : "Needed for the first tokens. Set meal rates, meal deposit, baburchi, service charge and advance months.",
      href: `/admin/settings?month=${start}`,
      action: "Settings",
    },
    {
      title: "bKash / Nagad / bank numbers",
      status: nonCash.length > 0 ? "done" : "warn",
      detail:
        nonCash.length > 0
          ? nonCash.map((a) => a.name).join(", ")
          : "Students see these on their phone to pay. Add at least the bKash number.",
      href: "/admin/settings",
      action: "Settings",
    },
    {
      title: "Meal on/off time for students",
      status: "done",
      detail:
        cutoff === null
          ? "Only the office changes meals."
          : `Students can change until ${formatHour(cutoff)} the night before.`,
      href: "/admin/settings",
      action: "Settings",
    },
    {
      title: "Cashiers",
      status: cashiers.length === 0 ? "warn" : cashiersWithout.length ? "todo" : "done",
      detail:
        cashiers.length === 0
          ? "No cashier yet. Add one if someone other than the admin takes payments."
          : cashiersWithout.length
            ? `${cashiersWithout.map((c) => c.fullName).join(", ")} has no building assigned (sees nothing).`
            : `${cashiers.length} cashier(s), all with buildings.`,
      href: "/admin/users",
      action: "Users",
    },
    {
      title: "Students imported",
      status: startSeats.n > 0 ? "done" : "todo",
      detail:
        startSeats.n > 0
          ? `${startSeats.n} students start on ${startDate}. ${openingLines.n} opening balance lines. ${activeStudents.n} active students in total.`
          : "Fill the Excel template and import every current student with what they owe.",
      href: "/admin/import",
      action: "Import",
    },
  ];

  if (earlySeats.n > 0 && lastClosed === null) {
    steps.push({
      title: "Students with a seat before the start",
      status: "warn",
      detail: `${earlySeats.n} student(s) have a seat from before ${startDate} (added by hand or for testing). At the first month-end their ${formatPeriod(opening)} meals will be charged. If they are test entries, mark them as left, or ask your developer to remove them.`,
      href: "/admin/students",
      action: "Students",
    });
  }

  steps.push({
    title: `First month-end on 1 ${formatPeriod(start)}`,
    status: startTokens.n > 0 ? "done" : "todo",
    detail:
      startTokens.n > 0
        ? `${startTokens.n} tokens made for ${formatPeriod(start)}. From now on month-end runs by itself every month.`
        : `On 1 ${formatPeriod(start)}, open Tokens, look at the preview and run month-end. It makes every student's first token (this month's charges + opening dues).`,
    href: "/admin/tokens",
    action: "Tokens",
  });
  return steps;
}
