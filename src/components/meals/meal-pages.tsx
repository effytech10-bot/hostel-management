import Link from "next/link";
import { PageHeader } from "@/components/layout/app-shell";
import { ActionButton } from "@/components/forms/action-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  addMonths,
  currentPeriod,
  dhakaDate,
  formatPeriod,
  isValidDate,
  isValidPeriod,
  periodEnd,
  periodStart,
} from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/server/auth/session";
import { formatMealUnits, MEAL_SLOT_LABEL, shiftDate } from "@/server/domain/meals";
import { listBuildings } from "@/server/services/buildings";
import { getMealDay, getMealReport, listHolidays } from "@/server/services/meals";
import { getEffectiveRates } from "@/server/services/rates";
import { mealCost } from "@/server/domain/billing";
import { formatTaka } from "@/lib/money";
import { db } from "@/server/db/client";
import { deleteHolidayAction } from "@/app/_actions/meals";
import { HolidayForm } from "./holiday-form";
import { MealGrid } from "./meal-grid";

type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function MealTabs({ basePath, active, isAdmin }: { basePath: string; active: string; isAdmin: boolean }) {
  const tabs = [
    { href: basePath, label: "Daily entry", key: "day" },
    { href: `${basePath}/report`, label: "Monthly count", key: "report" },
    ...(isAdmin ? [{ href: `${basePath}/holidays`, label: "Holidays", key: "holidays" }] : []),
  ];
  return (
    <div className="mb-6 flex gap-1 border-b">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm",
            active === t.key
              ? "border-primary text-foreground font-medium"
              : "text-muted-foreground border-transparent",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ---------------------------------------------------------------------------
// Daily entry
// ---------------------------------------------------------------------------

export async function MealDayPage({
  actor,
  basePath,
  searchParams,
}: {
  actor: SessionUser;
  basePath: string;
  searchParams: SearchParams;
}) {
  const buildingList = await listBuildings(actor);
  const today = dhakaDate();
  const dateParam = one(searchParams.date);
  const date = dateParam && isValidDate(dateParam) ? dateParam : today;
  const buildingParam = one(searchParams.building);
  const building =
    buildingList.find((b) => b.id === buildingParam) ?? (buildingList.length === 1 ? buildingList[0] : null);

  const hrefFor = (d: string) =>
    `${basePath}?${new URLSearchParams({ ...(building ? { building: building.id } : {}), date: d })}`;
  const day = building ? await getMealDay(actor, building.id, date) : null;

  return (
    <>
      <PageHeader title="Meals" description="Every meal is ON unless turned OFF. Tap to switch, then save." />
      <MealTabs basePath={basePath} active="day" isAdmin={actor.role === "admin"} />

      {buildingList.length === 0 ? (
        <p className="text-muted-foreground text-sm">No buildings available to you.</p>
      ) : (
        <>
          <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
            <Select name="building" defaultValue={building?.id ?? ""} className="w-auto min-w-40">
              <option value="">Choose building…</option>
              {buildingList.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code}
                </option>
              ))}
            </Select>
            <Input type="date" name="date" defaultValue={date} className="w-auto" />
            <Button type="submit" variant="outline">
              Open
            </Button>
          </form>

          {building && day && (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={hrefFor(shiftDate(date, -1))}>← Previous day</Link>
                </Button>
                <p className="px-2 font-medium">
                  {formatDay(date)}
                  {date === today && <span className="text-primary ml-2 text-xs">Today</span>}
                  {date === shiftDate(today, 1) && <span className="text-primary ml-2 text-xs">Tomorrow</span>}
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link href={hrefFor(shiftDate(date, 1))}>Next day →</Link>
                </Button>
                {date !== today && (
                  <Button asChild variant="ghost" size="sm">
                    <Link href={hrefFor(today)}>Go to today</Link>
                  </Button>
                )}
              </div>
              <MealGrid
                key={`${building.id}-${date}`}
                buildingId={building.id}
                date={date}
                rows={day.rows}
                holidays={day.holidays}
                readOnlyReason={day.editError}
              />
            </>
          )}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Monthly count
// ---------------------------------------------------------------------------

export async function MealReportPage({
  actor,
  basePath,
  searchParams,
}: {
  actor: SessionUser;
  basePath: string;
  searchParams: SearchParams;
}) {
  const buildingList = await listBuildings(actor);
  const periodParam = one(searchParams.month);
  const period = periodParam && isValidPeriod(periodParam) ? periodParam : currentPeriod();
  const buildingParam = one(searchParams.building);
  const buildingId = buildingList.some((b) => b.id === buildingParam) ? buildingParam : undefined;
  const [{ rows, totals }, effective] = await Promise.all([
    getMealReport(actor, period, buildingId),
    getEffectiveRates(db(), actor.orgId, period),
  ]);
  const rates = effective?.rates ?? null;
  const isCurrent = period === currentPeriod();

  return (
    <>
      <PageHeader
        title="Meals"
        description={`Meal count for ${formatPeriod(period)}${isCurrent ? " so far (includes meals planned for the rest of the month)" : ""}.`}
      />
      <MealTabs basePath={basePath} active="report" isAdmin={actor.role === "admin"} />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <Input type="month" name="month" defaultValue={period} className="w-auto" />
        <Select name="building" defaultValue={buildingId ?? ""} className="w-auto min-w-40">
          <option value="">All my buildings</option>
          {buildingList.map((b) => (
            <option key={b.id} value={b.id}>
              {b.code}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="outline">
          Show
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link
            href={`${basePath}/report?month=${addMonths(period, -1)}${buildingId ? `&building=${buildingId}` : ""}`}
          >
            ← Previous month
          </Link>
        </Button>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Breakfasts (½ meal)", value: totals.breakfast },
          { label: "Lunches", value: totals.lunch },
          { label: "Dinners", value: totals.dinner },
          { label: "Total meals", value: formatMealUnits(totals.halfUnits) },
        ].map((s) => (
          <Card key={s.label} className="gap-1 py-4">
            <CardHeader className="px-4">
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{s.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <p className="text-muted-foreground p-6 text-sm">No students in this month.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Building</TableHead>
                  <TableHead>Seat</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead className="text-right">Breakfast</TableHead>
                  <TableHead className="text-right">Lunch</TableHead>
                  <TableHead className="text-right">Dinner</TableHead>
                  <TableHead className="text-right">Meals</TableHead>
                  {rates && <TableHead className="text-right">Meal cost</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.studentId}>
                    <TableCell className="tabular-nums">{r.studentCode}</TableCell>
                    <TableCell className="font-medium">{r.fullName}</TableCell>
                    <TableCell>{r.buildingCode}</TableCell>
                    <TableCell>{r.seatText}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.days}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.breakfast}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.lunch}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.dinner}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMealUnits(r.halfUnits)}
                    </TableCell>
                    {rates && (
                      <TableCell className="text-right tabular-nums">{formatTaka(mealCost(r, rates))}</TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <p className="text-muted-foreground mt-3 text-xs">
        Meals = lunches + dinners + half of breakfasts.{" "}
        {rates
          ? `Meal cost uses the rates for ${formatPeriod(period)}: breakfast ${formatTaka(rates.breakfastRatePaisa)}, lunch ${formatTaka(rates.lunchRatePaisa)}, dinner ${formatTaka(rates.dinnerRatePaisa)}.`
          : "Set the meal rates in Settings to see meal cost."}
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Holidays (admin)
// ---------------------------------------------------------------------------

export async function MealHolidaysPage({ actor, basePath }: { actor: SessionUser; basePath: string }) {
  const period = currentPeriod();
  const [buildingList, holidays] = await Promise.all([
    listBuildings(actor),
    listHolidays(actor, periodStart(addMonths(period, -1)), periodEnd(addMonths(period, 1))),
  ]);

  return (
    <>
      <PageHeader
        title="Meals"
        description="Days when no meal is cooked (Eid, kitchen closed). Nobody is charged for these."
      />
      <MealTabs basePath={basePath} active="holidays" isAdmin />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Add holiday</CardTitle>
        </CardHeader>
        <CardContent>
          <HolidayForm buildings={buildingList.map((b) => ({ id: b.id, code: b.code }))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Holidays: last month to next month</CardTitle>
        </CardHeader>
        <CardContent>
          {holidays.length === 0 ? (
            <p className="text-muted-foreground text-sm">None.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Meal</TableHead>
                  <TableHead>Building</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {holidays.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="tabular-nums">{h.date}</TableCell>
                    <TableCell>{MEAL_SLOT_LABEL[h.slot]}</TableCell>
                    <TableCell>{h.buildingCode ?? "All buildings"}</TableCell>
                    <TableCell className="text-muted-foreground">{h.note ?? ""}</TableCell>
                    <TableCell className="text-right">
                      <ActionButton
                        action={deleteHolidayAction}
                        fields={{ holidayId: h.id }}
                        variant="ghost"
                        confirm="Remove this holiday? The meal will count again."
                        pendingLabel="Removing…"
                      >
                        Remove
                      </ActionButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
