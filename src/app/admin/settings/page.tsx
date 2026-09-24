import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addMonths, currentPeriod, formatPeriod, isValidPeriod } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { earliestEditablePeriod, getEffectiveRates, listRateHistory, SUGGESTED_RATES } from "@/server/services/rates";
import { getMealCutoffHour } from "@/server/services/org-settings";
import { listPaymentAccounts } from "@/server/services/payments";
import { MealCutoffForm } from "./meal-cutoff-form";
import { PaymentAccounts } from "./payment-accounts";
import { RatesForm } from "./rates-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const actor = await requireRole("admin");
  const { month } = await searchParams;
  const period = month && isValidPeriod(month) ? month : currentPeriod();

  const [effective, history, accounts, cutoffHour] = await Promise.all([
    getEffectiveRates(db(), actor.orgId, period),
    listRateHistory(actor),
    listPaymentAccounts(actor, { includeInactive: true }),
    getMealCutoffHour(db(), actor.orgId),
  ]);
  const locked = period < earliestEditablePeriod();
  const hasOwnRow = effective?.fromPeriod === period;

  return (
    <>
      <PageHeader title="Settings" description="Rates and charges. Each month can have its own rates." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/admin/settings?month=${addMonths(period, -1)}`}>← {formatPeriod(addMonths(period, -1))}</Link>
        </Button>
        <form method="get" className="flex items-center gap-2">
          <Input type="month" name="month" defaultValue={period} className="w-auto" />
          <Button type="submit" variant="outline" size="sm">
            Open
          </Button>
        </form>
        <Button asChild variant="outline" size="sm">
          <Link href={`/admin/settings?month=${addMonths(period, 1)}`}>{formatPeriod(addMonths(period, 1))} →</Link>
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Rates for {formatPeriod(period)}
            {period === currentPeriod() && <Badge variant="secondary">This month</Badge>}
            {locked && <Badge variant="destructive">Locked</Badge>}
          </CardTitle>
          <CardDescription>
            {!effective
              ? "No rates saved yet. The form is filled with the rates from the client's brief; check them and save."
              : hasOwnRow
                ? "This month has its own rates."
                : `This month uses the rates saved for ${formatPeriod(effective.fromPeriod)}. Save to give this month its own rates.`}
            {locked && " Months before last month can no longer be changed."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RatesForm key={period} period={period} defaults={effective?.rates ?? SUGGESTED_RATES} locked={locked} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rate history</CardTitle>
          <CardDescription>
            Only months where something was saved. Other months use the latest earlier row.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing saved yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>From month</TableHead>
                  <TableHead className="text-right">Breakfast</TableHead>
                  <TableHead className="text-right">Lunch</TableHead>
                  <TableHead className="text-right">Dinner</TableHead>
                  <TableHead className="text-right">Meal deposit</TableHead>
                  <TableHead className="text-right">Baburchi</TableHead>
                  <TableHead className="text-right">Service charge</TableHead>
                  <TableHead className="text-right">Advance</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/admin/settings?month=${r.period}`} className="text-primary hover:underline">
                        {formatPeriod(r.period)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatTaka(r.breakfastRatePaisa)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTaka(r.lunchRatePaisa)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTaka(r.dinnerRatePaisa)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTaka(r.mealDepositPaisa)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTaka(r.baburchiPaisa)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTaka(r.serviceChargePaisa)}
                      {r.serviceChargeThisMonth && <Badge className="ml-2">billed</Badge>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.advanceMonths} mo</TableCell>
                    <TableCell className="text-muted-foreground max-w-48 truncate">{r.notes ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Meal on/off by students</CardTitle>
          <CardDescription>
            Students can turn their own meals off (or back on) from their phone until this time on the night before.
            After that only the office can change that day. Meals the office turns off can only be turned on by the
            office.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MealCutoffForm cutoffHour={cutoffHour} />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Where money is received</CardTitle>
          <CardDescription>
            Cash box, bKash / Nagad numbers and bank accounts. Every payment records one of these, so the collection
            report shows how much is in each.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PaymentAccounts
            accounts={accounts.map((a) => ({
              id: a.id,
              name: a.name,
              method: a.method,
              details: a.details,
              isActive: a.isActive,
            }))}
          />
        </CardContent>
      </Card>
    </>
  );
}
