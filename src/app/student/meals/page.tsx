import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DailyMealSwitch, MealRangeForm, MyMealCalendar } from "@/components/student-portal/my-meals";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Note } from "@/components/ui/note";
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-[18px] font-bold text-ink">My meals</h1>
          <p className="text-muted text-[12px]">Breakfast is 0.5 meal. Lunch and dinner are 1 meal.</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            asChild
            variant="outline"
            size="sm"
            className={cn("h-8 w-8 p-0", !prev && "pointer-events-none opacity-40")}
          >
            <Link href={prev ? `/student/meals?month=${prev}` : "#"} aria-label="Previous month">
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <span className="min-w-20 text-center text-[12.5px] font-bold text-ink">{formatPeriod(period)}</span>
          <Button
            asChild
            variant="outline"
            size="sm"
            className={cn("h-8 w-8 p-0", !next && "pointer-events-none opacity-40")}
          >
            <Link href={next ? `/student/meals?month=${next}` : "#"} aria-label="Next month">
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

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
        <CardContent className="flex flex-col gap-2 text-[13.5px]">
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
              ? `You can change a day's meals until ${month.rules.cutoffText} the night before.`
              : me.status === "active"
                ? "Meals are turned on and off by the hostel office. Please tell the office."
                : "You have left the hostel."}
          </CardDescription>
        </CardHeader>
        {month.rules.firstEditable && month.rules.lastEditable && (
          <CardContent className="flex flex-col gap-3.5">
            <Note variant="info" className="text-[12.5px]">
              Right now you can change meals from <b>{month.rules.firstEditable}</b> onwards.
            </Note>

            <div className="rounded-[9px] border border-line bg-surface p-3" data-daily="breakfast">
              <DailyMealSwitch
                slot="breakfast"
                on={month.breakfastDaily.on}
                since={month.breakfastDaily.since}
                from={month.rules.firstEditable}
                today={today}
              />
            </div>
            <details className="group">
              <summary className="text-brand font-semibold text-[13px] hover:underline cursor-pointer select-none">
                Going home? Turn off several days at once
              </summary>
              <div className="mt-3.5 pt-3.5 border-t border-line-2">
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
            ✓ meal on · ✕ meal off · grey ✕ office locked · H holiday.
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
            <ul className="divide-line-2 flex flex-col divide-y text-[13.5px]">
              {settlements.map((s) => (
                <li key={s.period} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/student/meals?month=${s.period}`} className="text-brand font-semibold hover:underline">
                    {formatPeriod(s.period)}
                  </Link>
                  <span className="text-right">
                    <span className="tabular-nums font-semibold text-ink">{formatTaka(s.costPaisa)}</span>
                    <span
                      className={cn(
                        "block text-[11.5px] tabular-nums font-medium",
                        s.differencePaisa > 0 ? "text-bad" : "text-ok",
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
    <div className="flex justify-between items-center gap-3">
      <span className={bold ? "font-bold text-ink" : "text-muted text-[13px]"}>{label}</span>
      <span className={cn("tabular-nums text-ink", bold ? "font-bold text-[14px]" : "font-normal")}>{value}</span>
    </div>
  );
}
