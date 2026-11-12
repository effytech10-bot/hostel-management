import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiTile } from "@/components/ui/kpi";
import { Note } from "@/components/ui/note";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatPeriod, type Period } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/server/auth/session";
import { FUND_COLOR, FUND_LABEL, type Fund } from "@/server/domain/finance";
import type { Amounts, StatementLine } from "@/server/domain/income-statement";
import { getIncomeStatement, type IncomeStatement } from "@/server/services/finance";
import { CashWaterfall, EarnedSpentColumns, ExpenseBars, PartOfWhole, ProfitTrend } from "./statement-charts";

const tk = (p: number) => formatTaka(p);

function Dot({ fund }: { fund: Fund }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-full"
      style={{ background: FUND_COLOR[fund] }}
    />
  );
}

function Line({ l, sign = 1 }: { l: StatementLine; sign?: 1 | -1 }) {
  return (
    <TableRow>
      <TableCell className="pl-5">
        <span className="text-ink-2">{l.label}</span>
        {l.note && <span className="text-muted-foreground block text-[11.5px]">{l.note}</span>}
      </TableCell>
      <TableCell className="text-right tabular-nums">{tk(sign * l.monthPaisa)}</TableCell>
      <TableCell className="text-muted-foreground text-right tabular-nums">{tk(sign * l.allPaisa)}</TableCell>
    </TableRow>
  );
}

function Total({ label, a, tone }: { label: string; a: Amounts; tone: "earned" | "spent" }) {
  return (
    <TableRow className={tone === "earned" ? "bg-ok-bg/60" : "bg-bad-bg/60"}>
      <TableCell className="font-bold">{label}</TableCell>
      <TableCell className={cn("text-right font-bold tabular-nums", tone === "earned" ? "text-ok" : "text-bad")}>
        {tk(a.monthPaisa)}
      </TableCell>
      <TableCell className="text-right font-semibold tabular-nums">{tk(a.allPaisa)}</TableCell>
    </TableRow>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={3} className="text-muted-foreground pt-4 text-[11.5px] font-bold tracking-[0.06em] uppercase">
        {children}
      </TableCell>
    </TableRow>
  );
}

function ProfitRow({ a }: { a: Amounts }) {
  const good = a.monthPaisa >= 0;
  return (
    <TableRow className={cn("border-t-2", good ? "bg-ok-bg border-ok-line" : "bg-bad-bg border-bad-line")}>
      <TableCell className="text-[15px] font-bold">{good ? "Profit" : "Loss"} (earned − spent)</TableCell>
      <TableCell className={cn("text-right text-[16px] font-bold tabular-nums", good ? "text-ok" : "text-bad")}>
        {tk(a.monthPaisa)}
      </TableCell>
      <TableCell className={cn("text-right font-bold tabular-nums", a.allPaisa >= 0 ? "text-ok" : "text-bad")}>
        {tk(a.allPaisa)}
      </TableCell>
    </TableRow>
  );
}

function AccountStatement({ a, s }: { a: IncomeStatement["accounts"][number]; s: IncomeStatement }) {
  const good = a.profit.monthPaisa >= 0;
  return (
    <Card className="overflow-hidden" id={`acc-${a.fund}`}>
      <div className="h-1.5" style={{ background: FUND_COLOR[a.fund] }} />
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2 text-[17px]">
            <Dot fund={a.fund} />
            {FUND_LABEL[a.fund]} · income statement
          </CardTitle>
          <CardDescription>
            {formatPeriod(s.period)} (up to {formatDate(s.asOf)}) and everything since the start
          </CardDescription>
        </div>
        <span
          className={cn(
            "rounded-full border px-3 py-1 text-[13px] font-bold tabular-nums",
            good ? "border-ok-line bg-ok-bg text-ok" : "border-bad-line bg-bad-bg text-bad",
          )}
        >
          {good ? "Profit" : "Loss"} {tk(a.profit.monthPaisa)}
        </span>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead className="text-right">{formatPeriod(s.period)}</TableHead>
                  <TableHead className="text-right">Since the start</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <Heading>Earned</Heading>
                {a.income.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground pl-5 text-[13px]">
                      Nothing earned yet
                    </TableCell>
                  </TableRow>
                ) : (
                  a.income.map((l) => <Line key={l.key} l={l} />)
                )}
                <Total label="Total earned" a={a.earned} tone="earned" />
                <Heading>Spent</Heading>
                {a.expenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground pl-5 text-[13px]">
                      No expenses typed for this account
                    </TableCell>
                  </TableRow>
                ) : (
                  a.expenses.map((l) => <Line key={l.key} l={l} />)
                )}
                <Total label="Total spent" a={a.spent} tone="spent" />
                <ProfitRow a={a.profit} />
              </TableBody>
            </Table>
          </div>

          <div className="mt-5 flex flex-col gap-3">
            {a.progress.map((p) => (
              <PartOfWhole
                key={p.label}
                label={p.label}
                part={p.part}
                whole={p.whole}
                fund={a.fund}
                format={p.unit === "meals" ? (v) => `${v}` : tk}
              />
            ))}
          </div>

          <dl className="border-line-2 mt-4 grid gap-1.5 border-t pt-3 text-[12.5px]">
            {a.memo.map((m) => (
              <div key={m.label} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{m.label}</dt>
                <dd
                  className={cn(
                    "text-ink font-medium tabular-nums",
                    m.tone === "bad" && "text-bad",
                    m.tone === "ok" && "text-ok",
                  )}
                >
                  {m.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <section>
            <h4 className="text-ink mb-1 text-[13px] font-bold">Earned and spent, month by month</h4>
            <EarnedSpentColumns fund={a.fund} trend={s.trend} />
          </section>
          <section>
            <h4 className="text-ink mb-1 text-[13px] font-bold">
              Money in this account during {formatPeriod(s.period)}
            </h4>
            <p className="text-muted-foreground mb-2 text-[11.5px]">
              Green came in, red went out. The last bar is the balance.
            </p>
            <CashWaterfall steps={a.cash} />
          </section>
          <section>
            <h4 className="text-ink mb-2 text-[13px] font-bold">Where the money was spent</h4>
            <ExpenseBars fund={a.fund} rows={a.expenses} />
          </section>
        </div>
      </CardContent>
    </Card>
  );
}

export async function IncomeStatementView({ actor, period }: { actor: SessionUser; period: Period }) {
  const s = await getIncomeStatement(actor, period);
  const good = s.totals.profit.monthPaisa >= 0;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Note variant="info" className="max-w-3xl flex-1">
          Each account&apos;s own income statement: what it earned, what it spent, and the profit. Advance and the
          owner&apos;s own money are not income. Meal income is the meals actually eaten, not the deposit.
        </Note>
        <Button asChild className="gap-1.5">
          <a href={`/api/finance/income-statement?month=${s.period}`}>
            <Download className="size-4" />
            Download Excel
          </a>
        </Button>
      </div>

      {s.ratesMissing && (
        <Note variant="warn">
          Some months have meals but no meal rates in Settings; their meal income counts as ৳0.
        </Note>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label={`Earned · ${formatPeriod(s.period)}`} value={tk(s.totals.earned.monthPaisa)} tone="green" />
        <KpiTile
          label="Spent"
          value={tk(s.totals.spent.monthPaisa)}
          tone={s.totals.spent.monthPaisa > 0 ? "red" : "default"}
        />
        <KpiTile
          label={good ? "Profit" : "Loss"}
          value={tk(s.totals.profit.monthPaisa)}
          tone={good ? "green" : "red"}
        />
        <KpiTile label="Profit since the start" value={tk(s.totals.profit.allPaisa)} />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Profit of each account, month by month</CardTitle>
            <CardDescription>Last 6 months. Point at a dot to see the amount.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <ProfitTrend trend={s.trend} />
          <div className="flex flex-col gap-2">
            {s.accounts.map((a) => (
              <a
                key={a.fund}
                href={`#acc-${a.fund}`}
                className="border-line hover:bg-surface-2 flex items-center justify-between gap-3 rounded-[10px] border px-3 py-2.5"
              >
                <span className="flex items-center gap-2 text-[13.5px] font-semibold">
                  <Dot fund={a.fund} />
                  {FUND_LABEL[a.fund]}
                </span>
                <span className="text-right text-[12px]">
                  <span className="text-muted-foreground block">
                    earned {tk(a.earned.monthPaisa)} · spent {tk(a.spent.monthPaisa)}
                  </span>
                  <b className={cn("text-[14px] tabular-nums", a.profit.monthPaisa >= 0 ? "text-ok" : "text-bad")}>
                    {a.profit.monthPaisa >= 0 ? "Profit" : "Loss"} {tk(a.profit.monthPaisa)}
                  </b>
                </span>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      {s.accounts.map((a) => (
        <AccountStatement key={a.fund} a={a} s={s} />
      ))}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Every expense and owner entry · {formatPeriod(s.period)}</CardTitle>
            <CardDescription>Cancelled entries are shown crossed out; they do not count.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          {s.entries.length === 0 ? (
            <p className="text-muted-foreground px-6 text-[13px]">Nothing typed this month.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Voucher</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead>Paid from</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.entries.map((e) => (
                  <TableRow key={e.id} className={e.voidedAt ? "opacity-55" : undefined}>
                    <TableCell className="whitespace-nowrap tabular-nums">{formatDate(e.entryDate)}</TableCell>
                    <TableCell className="font-mono text-[12px]">{e.voucherNo}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <Dot fund={e.fund} />
                        {e.fundLabel}
                      </span>
                    </TableCell>
                    <TableCell>
                      {e.title}
                      <span className="text-muted-foreground block text-[11.5px]">
                        {e.kind === "expense"
                          ? e.category
                          : e.kind === "owner_withdraw"
                            ? "Owner took out"
                            : "Owner put in"}
                        {e.voidedAt ? ` · cancelled: ${e.voidReason ?? ""}` : ""}
                      </span>
                    </TableCell>
                    <TableCell>{e.accountName}</TableCell>
                    <TableCell className="text-muted-foreground">{e.byName ?? ""}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", e.voidedAt && "line-through")}>
                      {tk(e.amountPaisa)}
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
