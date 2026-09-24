import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/app-shell";
import { MealRangeForm, MyMealCalendar } from "@/components/student-portal/my-meals";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { addMonths, currentPeriod, dhakaDate, formatPeriod, isValidPeriod, periodOf } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import { cn } from "@/lib/utils";
import { requireRole } from "@/server/auth/session";
import { formatMealUnits } from "@/server/domain/meals";
import { getMyMealMonth, getMyStudent, listMySettlements } from "@/server/services/student-portal";

export const metadata: Metadata = { title: "My meals" };

export default async function StudentMealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole("student");
  const me = await getMyStudent(user);
  const sp = await searchParams;
  const raw = Array.isArray(sp.month) ? sp.month[0] : sp.month;

  const first = periodOf(me.admissionDate);
  const last = me.leftDate ? periodOf(me.leftDate) : addMonths(currentPeriod(), 1);
  let period = raw && isValidPeriod(raw) ? raw : currentPeriod();
  if (period < first) period = first;
  if (period > last) period = last;

  const [month, settlements] = await Promise.all([getMyMealMonth(user, period), listMySettlements(user)]);
  const today = dhakaDate();
  const days = month.days.filter((d) => d.inHostel);
  const prev = period > first ? addMonths(period, -1) : null;
  const next = period < last ? addMonths(period, 1) : null;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <PageHeader title="My meals" description="Breakfast is half a meal. Lunch and dinner are one meal each.">
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="sm" className={cn(!prev && "pointer-events-none opacity-40")}>
            <Link href={prev ? `/student/meals?month=${prev}` : "#"} aria-label="Previous month">
              <ChevronLeft />
            </Link>
          </Button>
          <span className="min-w-32 text-center text-sm font-medium">{formatPeriod(period)}</span>
          <Button asChild variant="outline" size="sm" className={cn(!next && "pointer-events-none opacity-40")}>
            <Link href={next ? `/student/meals?month=${next}` : "#"} aria-label="Next month">
              <ChevronRight />
            </Link>
          </Button>
        </div>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>{month.settlement ? "Month closed" : "This month so far"}</CardTitle>
          {!month.settlement && (
            <CardDescription>
              Until today. If nothing changes, the whole month will be {formatMealUnits(month.wholeMonth.halfUnits)}{" "}
              meals{month.wholeMonthCostPaisa !== null ? ` (${formatTaka(month.wholeMonthCostPaisa)})` : ""}.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {month.settlement ? (
            <>
              <Row
                label="Breakfast / Lunch / Dinner"
                value={`${month.settlement.breakfast} / ${month.settlement.lunch} / ${month.settlement.dinner}`}
              />
              <Row label="Meal cost" value={formatTaka(month.settlement.costPaisa)} />
              <Row label="Meal money you paid in advance" value={formatTaka(month.settlement.depositPaisa)} />
              <Row
                label={
                  month.settlement.differencePaisa >= 0
                    ? "Extra to pay (added to next bill)"
                    : "Returned to you (credit)"
                }
                value={formatTaka(Math.abs(month.settlement.differencePaisa))}
                bold
              />
            </>
          ) : (
            <>
              <Row label="Meals eaten" value={formatMealUnits(month.soFar.halfUnits)} bold />
              <Row
                label="Breakfast / Lunch / Dinner"
                value={`${month.soFar.breakfast} / ${month.soFar.lunch} / ${month.soFar.dinner}`}
              />
              {month.soFarCostPaisa !== null && (
                <Row label="Meal cost so far" value={formatTaka(month.soFarCostPaisa)} />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Turn meals on / off</CardTitle>
          <CardDescription>
            {month.rules.cutoffText
              ? `You can change a day's meals until ${month.rules.cutoffText} the night before. Right now you can change from ${month.rules.firstEditable} onwards.`
              : me.status === "active"
                ? "Meals are turned on and off by the hostel office. Please tell the office."
                : "You have left the hostel."}
          </CardDescription>
        </CardHeader>
        {month.rules.firstEditable && month.rules.lastEditable && (
          <CardContent>
            <details>
              <summary className="text-primary cursor-pointer text-sm select-none">
                Going home? Turn off several days at once
              </summary>
              <div className="mt-4">
                <MealRangeForm first={month.rules.firstEditable} last={month.rules.lastEditable} />
              </div>
            </details>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Day by day</CardTitle>
          <CardDescription>
            ✓ meal on · ✕ meal off · grey ✕ turned off by the office · H hostel holiday.
            {month.rules.cutoffText ? " Tap a big ✓ or ✕ to change it." : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MyMealCalendar days={days} today={today} />
        </CardContent>
      </Card>

      {settlements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Closed months</CardTitle>
            <CardDescription>Meal cost against the meal money you paid in advance.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y text-sm">
              {settlements.map((s) => (
                <li key={s.period} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/student/meals?month=${s.period}`} className="text-primary hover:underline">
                    {formatPeriod(s.period)}
                  </Link>
                  <span className="text-right">
                    <span className="tabular-nums">{formatTaka(s.costPaisa)}</span>
                    <span
                      className={cn(
                        "block text-xs tabular-nums",
                        s.differencePaisa > 0 ? "text-red-700" : "text-emerald-700",
                      )}
                    >
                      {s.differencePaisa > 0
                        ? `${formatTaka(s.differencePaisa)} extra`
                        : s.differencePaisa < 0
                          ? `${formatTaka(-s.differencePaisa)} returned`
                          : "exact"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-4", bold && "font-semibold")}>
      <span className={bold ? undefined : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
