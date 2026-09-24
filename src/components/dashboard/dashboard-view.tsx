import { AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPeriod } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { getDashboard } from "@/server/services/dashboard";

type Data = Awaited<ReturnType<typeof getDashboard>>;

function Stat({
  label,
  value,
  note,
  href,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  href?: string;
  tone?: "red";
}) {
  const body = (
    <Card className={cn("h-full gap-1 py-4", href && "hover:border-primary/50 transition-colors")}>
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle className={cn("text-2xl tabular-nums md:text-3xl", tone === "red" && "text-red-700")}>
          {value}
        </CardTitle>
        {note && <p className="text-muted-foreground text-xs">{note}</p>}
      </CardHeader>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

/** Home screen for admin and cashier (cashier: own buildings only). */
export function DashboardView({ data, area, isAdmin }: { data: Data; area: string; isAdmin: boolean }) {
  const { tokens, monthEnd } = data;
  const reports = `${area}/reports`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={`${area}/payments/new`}>+ Take payment</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`${area}/meals`}>Today&apos;s meals</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`${area}/students`}>Students</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Collected today"
          value={formatTaka(data.collectedToday.totalPaisa)}
          note={`${data.collectedToday.count} receipt(s)`}
          href={`${area}/payments`}
        />
        <Stat
          label={`Collected in ${formatPeriod(data.period)}`}
          value={formatTaka(data.collectedMonth.totalPaisa)}
          note={`${data.collectedMonth.count} receipt(s)`}
          href={`${reports}?r=collections`}
        />
        <Stat
          label="Total due now"
          value={formatTaka(data.dues.duePaisa)}
          note={`${data.dues.withDue} of ${data.dues.students} current students`}
          href={`${reports}?r=dues`}
          tone="red"
        />
        <Stat
          label="Student advance held"
          value={formatTaka(data.dues.advanceHeldPaisa)}
          note="Belongs to students, not income"
          href={`${reports}?r=dues&show=all`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{formatPeriod(data.period)} tokens</CardTitle>
            <CardDescription>
              {tokens.total === 0
                ? "No tokens for this month yet."
                : `${tokens.total} tokens · still unpaid ${formatTaka(tokens.remainingPaisa)}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            {tokens.total > 0 && (
              <>
                <Badge variant="success">{tokens.paid} paid</Badge>
                <Badge variant="secondary">{tokens.partial} partly paid</Badge>
                <Badge variant="destructive">{tokens.unpaid} unpaid</Badge>
              </>
            )}
            <Link href={`${area}/tokens?status=due`} className="text-primary ml-auto text-sm hover:underline">
              Who has not paid →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {monthEnd.neverRun || monthEnd.needsClosing ? (
                <AlertTriangle className="size-5 text-amber-600" />
              ) : (
                <CheckCircle2 className="size-5 text-emerald-600" />
              )}
              Month-end
            </CardTitle>
            <CardDescription>
              {monthEnd.neverRun
                ? "Month-end has never been run. The first time must be done by the admin from Tokens."
                : monthEnd.needsClosing
                  ? `${formatPeriod(monthEnd.needsClosing)} is not closed yet. Close it from Tokens so meals are settled and this month's tokens are made.`
                  : `Up to date. Last closed: ${formatPeriod(monthEnd.lastClosed!)}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 text-sm">
            <Link href={`${area}/tokens`} className="text-primary hover:underline">
              Tokens
            </Link>
            {monthEnd.neverRun && isAdmin && (
              <Link href="/admin/go-live" className="text-primary font-medium hover:underline">
                Go-live checklist & Excel import →
              </Link>
            )}
            {data.formerDues.withDue > 0 && (
              <Link href={`${reports}?r=dues&status=left`} className="text-red-700 hover:underline">
                {data.formerDues.withDue} former student(s) still owe {formatTaka(data.formerDues.duePaisa)}
              </Link>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Buildings</CardTitle>
          <CardDescription>
            {data.occupancy.occupied} of {data.occupancy.seats} seats occupied · {data.occupancy.vacant} vacant
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.buildings.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {isAdmin ? (
                <>
                  No buildings yet. Start in{" "}
                  <Link href="/admin/buildings" className="text-primary hover:underline">
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
                        className="text-primary font-medium hover:underline"
                      >
                        {b.code}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b.occupied} / {b.seats}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{b.vacant}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.withDue}</TableCell>
                    <TableCell className="text-right text-red-700 tabular-nums">{formatTaka(b.duePaisa)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTaka(b.collectedMonthPaisa)}</TableCell>
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
