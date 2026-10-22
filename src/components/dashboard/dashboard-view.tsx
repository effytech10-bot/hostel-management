import { AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiTile } from "@/components/ui/kpi";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPeriod } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import type { getDashboard } from "@/server/services/dashboard";

type Data = Awaited<ReturnType<typeof getDashboard>>;

/** Home screen for admin and cashier (cashier: own buildings only). */
export function DashboardView({ data, area, isAdmin }: { data: Data; area: string; isAdmin: boolean }) {
  const { tokens, monthEnd } = data;
  const reports = `${area}/reports`;

  return (
    <div className="flex flex-col gap-4">
      {/* 4 KPI tiles in responsive grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 min-[1180px]:grid-cols-4 gap-3.5">
        <KpiTile
          label="Collected today"
          value={formatTaka(data.collectedToday.totalPaisa)}
          note={`${data.collectedToday.count} receipt(s)`}
          href={`${area}/payments`}
        />
        <KpiTile
          label={`Collected in ${formatPeriod(data.period)}`}
          value={formatTaka(data.collectedMonth.totalPaisa)}
          note={`${data.collectedMonth.count} receipt(s)`}
          href={`${reports}?r=collections`}
        />
        <KpiTile
          label="Total due now"
          value={formatTaka(data.dues.duePaisa)}
          note={`${data.dues.withDue} of ${data.dues.students} current students`}
          href={`${reports}?r=dues`}
          tone="red"
        />
        <KpiTile
          label="Student advance held"
          value={formatTaka(data.dues.advanceHeldPaisa)}
          note="Belongs to students, not income"
          href={`${reports}?r=dues&show=all`}
        />
      </div>

      {/* 2-column cards: Tokens status and Month-end */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{formatPeriod(data.period)} tokens</CardTitle>
              <CardDescription>
                {tokens.total === 0
                  ? "No tokens for this month yet."
                  : `${tokens.total} tokens · still unpaid ${formatTaka(tokens.remainingPaisa)}`}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            {tokens.total > 0 ? (
              <>
                <Badge variant="success">{tokens.paid} paid</Badge>
                <Badge variant="warn">{tokens.partial} partly paid</Badge>
                <Badge variant="destructive">{tokens.unpaid} unpaid</Badge>
              </>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href={`${area}/tokens`}>Tokens →</Link>
              </Button>
            )}
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-brand hover:text-brand-600 hover:bg-brand-50/60 ml-auto font-medium"
            >
              <Link href={`${area}/tokens?status=due`}>Who has not paid →</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex-1 pr-2">
              <CardTitle>Month-end</CardTitle>
              <CardDescription>
                {monthEnd.neverRun
                  ? "Tokens have never been made. The first run must be done by the admin from Tokens."
                  : monthEnd.needsClosing
                    ? `${formatPeriod(monthEnd.needsClosing)} is not closed yet. Make this month's tokens from Tokens (meals up to the end of last month go in their pre meal).`
                    : `Up to date. Last month locked: ${formatPeriod(monthEnd.lastClosed!)}.`}
              </CardDescription>
            </div>
            {monthEnd.neverRun ? (
              <Badge variant="destructive" className="gap-1 shrink-0">
                <AlertTriangle className="size-3" /> Not started
              </Badge>
            ) : monthEnd.needsClosing ? (
              <Badge variant="warn" className="gap-1 shrink-0">
                <AlertTriangle className="size-3" /> Needs closing
              </Badge>
            ) : (
              <Badge variant="success" className="gap-1 shrink-0">
                <CheckCircle2 className="size-3" /> Up to date
              </Badge>
            )}
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`${area}/tokens`}>Tokens</Link>
            </Button>
            {monthEnd.neverRun && isAdmin && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/go-live">Go-live checklist & Excel import →</Link>
              </Button>
            )}
            {data.formerDues.withDue > 0 && (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-bad hover:text-bad hover:bg-bad-bg/60 font-medium"
              >
                <Link href={`${reports}?r=dues&status=left`}>
                  {data.formerDues.withDue} former student(s) still owe {formatTaka(data.formerDues.duePaisa)} →
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Buildings occupancy card */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Buildings</CardTitle>
            <CardDescription>
              {data.occupancy.occupied} of {data.occupancy.seats} seats occupied · {data.occupancy.vacant} vacant
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {data.buildings.length === 0 ? (
            <p className="text-muted-foreground text-[13.5px]">
              {isAdmin ? (
                <>
                  No buildings yet. Start in{" "}
                  <Link href="/admin/buildings" className="text-brand font-medium hover:underline">
                    Buildings
                  </Link>
                  .
                </>
              ) : (
                "No building is assigned to you yet. Ask the admin."
              )}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Building</TableHead>
                  <TableHead className="text-right">Occupied</TableHead>
                  <TableHead className="text-right">Vacant</TableHead>
                  <TableHead className="text-right">Students with due</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead className="text-right">Collected this month</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.buildings.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <Link
                        href={`${reports}?r=dues&building=${b.id}`}
                        className="text-brand font-bold hover:underline"
                      >
                        {b.code}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {b.occupied} / {b.seats}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">{b.vacant}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{b.withDue}</TableCell>
                    <TableCell className="text-bad text-right font-semibold tabular-nums">
                      {formatTaka(b.duePaisa)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatTaka(b.collectedMonthPaisa)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
