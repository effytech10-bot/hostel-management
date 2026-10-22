import Link from "next/link";
import { PageHeader } from "@/components/layout/app-shell";
import { ActionButton } from "@/components/forms/action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { KpiTile } from "@/components/ui/kpi";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsNav } from "@/components/ui/tabs-nav";
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
    { href: basePath, label: "Daily entry", key: "day", active: active === "day" },
    { href: `${basePath}/report`, label: "Monthly count", key: "report", active: active === "report" },
    ...(isAdmin ? [{ href: `${basePath}/holidays`, label: "Holidays", key: "holidays", active: active === "holidays" }] : []),
  ];
  return <TabsNav items={tabs} className="mb-6" />;
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
          <form method="get" className="mb-4 flex flex-wrap items-end gap-2.5">
            <div className="flex flex-col gap-1">
              <label className="text-[12.5px] font-semibold text-ink-2">Building</label>
              <Select name="building" defaultValue={building?.id ?? ""} className="w-auto min-w-40 h-9 text-[13.5px]">
                <option value="">Choose building…</option>
                {buildingList.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[12.5px] font-semibold text-ink-2">Date</label>
              <Input type="date" name="date" defaultValue={date} className="w-auto h-9 text-[13.5px]" />
            </div>
            <Button type="submit" variant="outline" size="sm" className="h-9">
              Open
            </Button>
          </form>

          {building && day && (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={hrefFor(shiftDate(date, -1))}>← Previous day</Link>
                </Button>
                <div className="flex items-center gap-2 px-2 font-semibold text-[14.5px] text-ink">
                  <span>{formatDay(date)}</span>
                  {date === today && <Badge variant="info">Today</Badge>}
                  {date === shiftDate(today, 1) && <Badge variant="info">Tomorrow</Badge>}
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={hrefFor(shiftDate(date, 1))}>Next day →</Link>
                </Button>
                {date !== today && (
                  <Button asChild variant="ghost" size="sm" className="text-brand hover:text-brand-600">
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

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2.5">
        <div className="flex flex-col gap-1">
          <label className="text-[12.5px] font-semibold text-ink-2">Month</label>
          <Input type="month" name="month" defaultValue={period} className="w-auto h-9 text-[13.5px]" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[12.5px] font-semibold text-ink-2">Building</label>
          <Select name="building" defaultValue={buildingId ?? ""} className="w-auto min-w-40 h-9 text-[13.5px]">
            <option value="">All my buildings</option>
            {buildingList.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="outline" size="sm" className="h-9">
          Show
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-9 text-brand hover:text-brand-600">
          <Link
            href={`${basePath}/report?month=${addMonths(period, -1)}${buildingId ? `&building=${buildingId}` : ""}`}
          >
            ← Previous month
          </Link>
        </Button>
      </form>

      <div className="mb-4 grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <KpiTile label="Breakfasts (½ meal)" value={totals.breakfast} />
        <KpiTile label="Lunches" value={totals.lunch} />
        <KpiTile label="Dinners" value={totals.dinner} />
        <KpiTile label="Total meals" value={formatMealUnits(totals.halfUnits)} />
      </div>

      <Card>
        <CardContent>
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
                    <TableCell className="font-mono text-xs tabular-nums">{r.studentCode}</TableCell>
                    <TableCell className="font-semibold text-ink">{r.fullName}</TableCell>
                    <TableCell>{r.buildingCode}</TableCell>
                    <TableCell className="font-mono text-xs">{r.seatText}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.days}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.breakfast}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.lunch}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.dinner}</TableCell>
                    <TableCell className="text-right font-bold tabular-nums">
                      {formatMealUnits(r.halfUnits)}
                    </TableCell>
                    {rates && (
                      <TableCell className="text-right font-semibold tabular-nums text-ink">{formatTaka(mealCost(r, rates))}</TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <p className="text-muted-foreground mt-3 text-xs leading-normal">
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
                    <TableCell className="font-mono text-xs tabular-nums">{h.date}</TableCell>
                    <TableCell className="font-medium">{MEAL_SLOT_LABEL[h.slot]}</TableCell>
                    <TableCell>{h.buildingCode ?? "All buildings"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{h.note ?? ""}</TableCell>
                    <TableCell className="text-right">
                      <ActionButton
                        action={deleteHolidayAction}
                        fields={{ holidayId: h.id }}
                        variant="ghost"
                        confirm="Remove this holiday? The meal will count again."
                        pendingLabel="Removing…"
                        className="text-bad hover:text-bad hover:bg-bad-bg/60"
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
