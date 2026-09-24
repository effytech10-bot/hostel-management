import Link from "next/link";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { currentPeriod, formatPeriod, isValidPeriod } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import type { SessionUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listBuildings } from "@/server/services/buildings";
import { planMonthEnd } from "@/server/services/month-end";
import { listBillingPeriods, listTokens } from "@/server/services/tokens";
import { MonthEndButton } from "./month-end-button";
import { TokenStatusBadge } from "./token-status";

type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/** Admin: close last month + make this month's tokens, with a full preview first. */
async function MonthEndPanel({ actor }: { actor: SessionUser }) {
  const period = currentPeriod();
  const plan = await planMonthEnd(db(), actor.orgId, period);
  const nothingToDo = plan.tokens.length === 0 && plan.alreadyClosed;
  const tokenTotal = plan.tokens.reduce((s, t) => s + t.token.totalPaisa, 0);
  const billed = plan.tokens.reduce((s, t) => s + t.token.currentTotalPaisa, 0);
  const mealCost = plan.settlements.reduce((s, x) => s + x.costPaisa, 0);
  const deposits = plan.settlements.reduce((s, x) => s + x.depositPaisa, 0);

  return (
    <Card className="border-primary/40 mb-6">
      <CardHeader>
        <CardTitle>Month-end for {formatPeriod(period)}</CardTitle>
        <CardDescription>
          This closes {formatPeriod(plan.closePeriod)} (settles every student&apos;s meals and locks the month) and
          makes the {formatPeriod(period)} token for every active student. It runs by itself every night once the first
          month-end has been done here. Running it again only adds tokens that are missing.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {plan.blockers.length > 0 && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            <p className="font-medium">Fix these first:</p>
            <ul className="list-disc pl-5">
              {plan.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <Link href="/admin/settings" className="mt-2 inline-block underline">
              Open Settings
            </Link>
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-semibold">
            1. Close {formatPeriod(plan.closePeriod)}{" "}
            {plan.alreadyClosed && <Badge variant="secondary">already closed</Badge>}
          </p>
          {!plan.alreadyClosed && (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Stat label="Meal settlements" value={plan.settlements.length} />
              <Stat label="Meals eaten (cost)" value={formatTaka(mealCost)} />
              <Stat label="Meal deposits billed" value={formatTaka(deposits)} />
              <Stat label="Students owe more (−credit)" value={formatTaka(mealCost - deposits)} />
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">
            2. Tokens for {formatPeriod(period)}{" "}
            {plan.tokensAlreadyMade > 0 && <Badge variant="secondary">{plan.tokensAlreadyMade} already made</Badge>}
          </p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="New tokens" value={plan.tokens.length} />
            <Stat label="This month's charges" value={formatTaka(billed)} />
            <Stat label="Total to be paid (with old dues)" value={formatTaka(tokenTotal)} />
          </div>
          {plan.tokens.length > 0 && (
            <details className="mt-3">
              <summary className="text-primary cursor-pointer text-sm select-none">
                Preview every token ({plan.tokens.length})
              </summary>
              <Table className="mt-2">
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Seat</TableHead>
                    <TableHead className="text-right">This month</TableHead>
                    <TableHead className="text-right">Previous</TableHead>
                    <TableHead className="text-right">To be paid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plan.tokens.map((t) => (
                    <TableRow key={t.studentId}>
                      <TableCell>
                        {t.fullName} <span className="text-muted-foreground text-xs">{t.studentCode}</span>
                      </TableCell>
                      <TableCell>
                        {t.buildingCode} · {t.seatText}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatTaka(t.token.currentTotalPaisa)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatTaka(t.token.previousTotalPaisa)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatTaka(t.token.totalPaisa)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </details>
          )}
        </div>

        {plan.blockers.length === 0 && !nothingToDo && (
          <MonthEndButton
            period={period}
            label={
              plan.alreadyClosed
                ? `Make ${plan.tokens.length} token(s) for ${formatPeriod(period)}`
                : `Close ${formatPeriod(plan.closePeriod)} & make ${plan.tokens.length} token(s)`
            }
            confirmText={`${plan.alreadyClosed ? "" : `${formatPeriod(plan.closePeriod)} will be locked: its meals, payments and rates can no longer be changed. `}Make ${plan.tokens.length} token(s) for ${formatPeriod(period)}?`}
          />
        )}
        {nothingToDo && <p className="text-muted-foreground text-sm">Everything is done for {formatPeriod(period)}.</p>}
      </CardContent>
    </Card>
  );
}

export async function TokensPage({
  actor,
  basePath,
  searchParams,
}: {
  actor: SessionUser;
  basePath: string;
  searchParams: SearchParams;
}) {
  const monthParam = one(searchParams.month);
  const period = monthParam && isValidPeriod(monthParam) ? monthParam : currentPeriod();
  const buildingParam = one(searchParams.building);
  const buildingList = await listBuildings(actor);
  const buildingId = buildingList.some((b) => b.id === buildingParam) ? buildingParam : undefined;
  const statusParam = one(searchParams.status);
  const status =
    statusParam === "paid" || statusParam === "partial" || statusParam === "unpaid" || statusParam === "due"
      ? statusParam
      : undefined;
  const [rows, periods] = await Promise.all([listTokens(actor, period, buildingId, status), listBillingPeriods(actor)]);
  const total = rows.reduce((s, r) => s + r.totalPaisa, 0);
  const paid = rows.reduce((s, r) => s + r.paidPaisa, 0);
  const remaining = rows.reduce((s, r) => s + r.remainingPaisa, 0);
  const counts = { paid: 0, partial: 0, unpaid: 0 };
  for (const r of rows) counts[r.status]++;
  const studentsPath = basePath.replace("/tokens", "/students");
  const printHref = `/print/tokens?${new URLSearchParams({ month: period, ...(buildingId ? { building: buildingId } : {}) })}`;

  return (
    <>
      <PageHeader title="Tokens" description={`Monthly bills for ${formatPeriod(period)}`}>
        {rows.length > 0 && (
          <Button asChild>
            <Link href={printHref} target="_blank">
              Print {rows.length} token(s)
            </Link>
          </Button>
        )}
      </PageHeader>

      {actor.role === "admin" && <MonthEndPanel actor={actor} />}

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <Input type="month" name="month" defaultValue={period} className="w-auto" />
        <Select name="building" defaultValue={buildingId ?? ""} className="w-auto min-w-36">
          <option value="">All buildings</option>
          {buildingList.map((b) => (
            <option key={b.id} value={b.id}>
              {b.code}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={status ?? ""} className="w-auto min-w-40">
          <option value="">All</option>
          <option value="due">Not fully paid</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partly paid</option>
          <option value="paid">Paid</option>
        </Select>
        <Button type="submit" variant="outline">
          Show
        </Button>
      </form>

      {rows.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label={`Billed (${rows.length} tokens)`} value={formatTaka(total)} />
          <Stat label="Paid so far" value={formatTaka(paid)} />
          <Stat label="Still to collect" value={formatTaka(remaining)} />
          <Stat label="Paid · Partly · Unpaid" value={`${counts.paid} · ${counts.partial} · ${counts.unpaid}`} />
        </div>
      )}

      <Card className="py-0">
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <p className="text-muted-foreground p-6 text-sm">No tokens for this month.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Seat</TableHead>
                  <TableHead className="text-right">This month</TableHead>
                  <TableHead className="text-right">Previous</TableHead>
                  <TableHead className="text-right">To be paid</TableHead>
                  <TableHead className="text-right">Still due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums">{r.studentCode}</TableCell>
                    <TableCell>
                      <Link href={`${studentsPath}/${r.studentId}`} className="font-medium hover:underline">
                        {r.fullName}
                      </Link>
                      {r.kind === "admission" && (
                        <Badge variant="outline" className="ml-2">
                          First bill
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{r.seatText}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTaka(r.currentTotalPaisa)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTaka(r.previousTotalPaisa)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatTaka(r.totalPaisa)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTaka(r.remainingPaisa)}</TableCell>
                    <TableCell>
                      <TokenStatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {r.status !== "paid" && (
                        <Link
                          href={`${basePath.replace("/tokens", "/payments")}/new?student=${r.studentId}`}
                          className="text-primary mr-3 text-sm hover:underline"
                        >
                          Take payment
                        </Link>
                      )}
                      <Link
                        href={`/print/tokens?token=${r.id}`}
                        target="_blank"
                        className="text-primary text-sm hover:underline"
                      >
                        Print
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={5} className="text-right font-medium">
                    Total
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatTaka(total)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatTaka(remaining)}</TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {periods.length > 0 && (
        <p className="text-muted-foreground mt-4 text-xs">
          Months:{" "}
          {periods.map((p, i) => (
            <span key={p.id}>
              {i > 0 && " · "}
              <Link href={`${basePath}?month=${p.period}`} className="hover:underline">
                {formatPeriod(p.period)}
              </Link>
              {p.closedAt ? " (closed)" : p.tokensGeneratedAt ? " (tokens made)" : ""}
            </span>
          ))}
        </p>
      )}
    </>
  );
}
