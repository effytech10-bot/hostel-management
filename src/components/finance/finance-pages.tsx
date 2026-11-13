import Link from "next/link";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { KpiTile } from "@/components/ui/kpi";
import { Note } from "@/components/ui/note";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsNav } from "@/components/ui/tabs-nav";
import { addMonths, currentPeriod, formatDate, formatPeriod, isValidPeriod, type Period } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import { cn } from "@/lib/utils";
import { METHOD_LABEL } from "@/lib/validation/payments";
import type { SessionUser } from "@/server/auth/session";
import {
  buildAccountFlow,
  FUND_COLOR,
  FUND_LABEL,
  FUND_SHORT,
  FUNDS,
  fundOrderLabel,
  type Fund,
} from "@/server/domain/finance";
import { formatMealUnits } from "@/server/domain/meals";
import { listBuildings } from "@/server/services/buildings";
import { IncomeStatementView } from "./income-statement-view";
import {
  getCashbook,
  getFinanceOverview,
  getStatements,
  listExpenseCategories,
  listFinanceEntries,
  type FinanceOverview,
} from "@/server/services/finance";
import { getPaymentOrder } from "@/server/services/org-settings";
import { listPaymentAccounts } from "@/server/services/payments";
import { db } from "@/server/db/client";
import { EntryForm, VoidEntry } from "./entry-form";
import { MoneyFlow } from "./money-flow";

const BASE = "/admin/finance";
const TABS = [
  { key: "overview", label: "Overview" },
  { key: "expenses", label: "Expenses & owner money" },
  { key: "cashbook", label: "Cash book" },
  { key: "income", label: "Income statement" },
  { key: "statements", label: "Profit & balance sheet" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const tk = (paisa: number) => formatTaka(paisa);
/** Money with a sign in front, for "in / out" lists. */
const signed = (paisa: number) => (paisa === 0 ? "—" : `${paisa > 0 ? "+" : "−"}${formatTaka(Math.abs(paisa))}`);

function FundDot({ fund }: { fund: Fund }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-[3px]"
      style={{ background: FUND_COLOR[fund] }}
    />
  );
}

function Row({
  label,
  value,
  strong,
  tone,
  hint,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  strong?: boolean;
  tone?: "ok" | "bad";
  hint?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-[5px] text-[13.5px]", strong && "font-bold")}>
      <span className={strong ? "text-ink" : "text-ink-2"}>
        {label}
        {hint && <span className="text-muted-foreground block text-[11.5px] font-normal">{hint}</span>}
      </span>
      <span className={cn("text-ink shrink-0 tabular-nums", tone === "ok" && "text-ok", tone === "bad" && "text-bad")}>
        {value}
      </span>
    </div>
  );
}

const Divider = () => <div className="border-line-2 my-2 border-t" />;
const SubTitle = ({ children }: { children: React.ReactNode }) => (
  <p className="text-muted-foreground mt-1 mb-0.5 text-[11.5px] font-semibold tracking-wide uppercase">{children}</p>
);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export async function FinancePage({
  actor,
  searchParams,
}: {
  actor: SessionUser;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const tab = (TABS.find((t) => t.key === one(searchParams.tab))?.key ?? "overview") as Tab;
  const monthParam = one(searchParams.month);
  const period =
    monthParam && isValidPeriod(monthParam) && monthParam <= currentPeriod() ? monthParam : currentPeriod();
  const fund = (FUNDS.find((f) => f === one(searchParams.fund)) ?? "meal") as Fund;
  const href = (p: { tab?: Tab; month?: Period; fund?: Fund }) => {
    const t = p.tab ?? tab;
    const q = new URLSearchParams({ tab: t, month: p.month ?? period });
    if (t === "cashbook") q.set("fund", p.fund ?? fund);
    return `${BASE}?${q}`;
  };

  return (
    <>
      <PageHeader
        title="Finance"
        description="Three accounts: Rent & advance, Meal, Service. What came in, what went out, and the profit."
      >
        <Button asChild variant="outline" size="sm">
          <Link href={href({ month: addMonths(period, -1) })}>← {formatPeriod(addMonths(period, -1))}</Link>
        </Button>
        <form method="get" className="flex items-center gap-2">
          <input type="hidden" name="tab" value={tab} />
          {tab === "cashbook" && <input type="hidden" name="fund" value={fund} />}
          <Input
            type="month"
            name="month"
            defaultValue={period}
            max={currentPeriod()}
            aria-label="Month"
            className="h-9 w-auto text-[13.5px]"
          />
          <Button type="submit" variant="outline" size="sm" className="h-9">
            Open
          </Button>
        </form>
        {period < currentPeriod() && (
          <Button asChild variant="outline" size="sm">
            <Link href={href({ month: addMonths(period, 1) })}>{formatPeriod(addMonths(period, 1))} →</Link>
          </Button>
        )}
      </PageHeader>

      <TabsNav
        className="mb-5"
        items={TABS.map((t) => ({ key: t.key, label: t.label, href: href({ tab: t.key }), active: t.key === tab }))}
      />

      {tab === "overview" && <Overview actor={actor} period={period} href={href} />}
      {tab === "expenses" && <Expenses actor={actor} period={period} />}
      {tab === "cashbook" && <Cashbook actor={actor} period={period} fund={fund} href={href} />}
      {tab === "income" && <IncomeStatementView actor={actor} period={period} />}
      {tab === "statements" && <StatementsView actor={actor} period={period} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

async function Overview({
  actor,
  period,
  href,
}: {
  actor: SessionUser;
  period: Period;
  href: (p: { tab?: Tab; fund?: Fund }) => string;
}) {
  const d = await getFinanceOverview(actor, period);
  const month = formatPeriod(period);
  const when = d.isCurrent ? "now" : `at the end of ${month}`;
  const match = d.totals.inHandPaisa === d.totals.accountsPaisa;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiTile
          label={`Earned in ${month}`}
          value={tk(d.totals.incomePaisa)}
          note="Rent + meals eaten + service charge"
        />
        <KpiTile
          label={`Spent in ${month}`}
          value={tk(d.totals.expensePaisa)}
          note="All expenses of the three accounts"
        />
        <KpiTile
          label={d.totals.profitPaisa >= 0 ? "Profit" : "Loss"}
          value={tk(Math.abs(d.totals.profitPaisa))}
          tone={d.totals.profitPaisa >= 0 ? "green" : "red"}
          note="Earned − spent"
        />
        <KpiTile label={`Money in hand ${when}`} value={tk(d.totals.inHandPaisa)} note="Cash + bKash / Nagad + bank" />
      </div>

      {d.meal.ratesMissing && (
        <Note variant="warn">Meal rates for {month} are not set in Settings, so the meal income shows as ৳0.</Note>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Where each account&apos;s money came from and where it went · {month}</CardTitle>
            <CardDescription>
              The three accounts are separate, so each has its own picture. Left: the balance at the start and the money
              that came in. Right: the money that went out and the balance {when}. Thicker = more money; point at a band
              to see the amount.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col">
          {d.accounts.map((a) => {
            const into = a.studentInPaisa + a.ownerInPaisa + Math.max(0, a.movedPaisa);
            const out = a.expensePaisa + a.refundedPaisa + a.ownerOutPaisa + Math.max(0, -a.movedPaisa);
            return (
              <section key={a.fund} className="border-line-2 border-t pt-4 pb-5 first:border-t-0 first:pt-0">
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="text-ink flex items-center gap-2 text-[15px] font-bold">
                    <span aria-hidden className="size-2.5 rounded-full" style={{ background: FUND_COLOR[a.fund] }} />
                    {FUND_LABEL[a.fund]}
                  </h3>
                  <p className="text-muted-foreground text-[12.5px] tabular-nums">
                    Start <b className="text-ink font-semibold">{tk(a.openingPaisa)}</b> + in{" "}
                    <b className="text-ink font-semibold">{tk(into)}</b> − out{" "}
                    <b className="text-ink font-semibold">{tk(out)}</b> = {when}{" "}
                    <b className="text-ink font-semibold">{tk(a.closingPaisa)}</b>
                  </p>
                </div>
                <MoneyFlow
                  flow={buildAccountFlow(a, { endLabel: d.isCurrent ? "Balance now" : "Balance at the end" })}
                  legend={false}
                  note={false}
                  minHeight={180}
                  label={`Money flow of the ${FUND_LABEL[a.fund]}`}
                />
              </section>
            );
          })}
          {d.accounts.some((a) => Object.values(a.movedWith ?? {}).some((v) => v)) && (
            <p className="text-muted-foreground border-line-2 border-t pt-3 text-[12.5px]">
              <b className="text-ink-2 font-semibold">From / To another account:</b> nobody moved money by hand. A
              student had extra money kept in one account, and their new token used it to pay a due that belongs to
              another account. The same amount leaves one account and arrives in the other.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-3">
        {d.accounts.map((a) => (
          <AccountCard key={a.fund} a={a} d={d} when={when} cashbookHref={href({ tab: "cashbook", fund: a.fund })} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Where the money is kept</CardTitle>
            <CardDescription>
              The same money as the three accounts, counted by cash box, mobile banking and bank.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kept in</TableHead>
                <TableHead className="text-right">Start of month</TableHead>
                <TableHead className="text-right">Came in</TableHead>
                <TableHead className="text-right">Went out</TableHead>
                <TableHead className="text-right">Balance {when}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.wallets.map((w) => (
                <TableRow key={w.id}>
                  <TableCell>
                    <span className="font-medium">{w.name}</span>
                    <span className="text-muted-foreground ml-1.5 text-xs">{METHOD_LABEL[w.method]}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{tk(w.openingPaisa)}</TableCell>
                  <TableCell className="text-right tabular-nums">{tk(w.inPaisa)}</TableCell>
                  <TableCell className="text-right tabular-nums">{tk(w.outPaisa)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{tk(w.closingPaisa)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-surface-2 font-bold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">
                  {tk(d.wallets.reduce((s, w) => s + w.openingPaisa, 0))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {tk(d.wallets.reduce((s, w) => s + w.inPaisa, 0))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {tk(d.wallets.reduce((s, w) => s + w.outPaisa, 0))}
                </TableCell>
                <TableCell className="text-right tabular-nums">{tk(d.totals.inHandPaisa)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <Note variant={match ? "ok" : "bad"} className="mt-3">
            {match
              ? `✓ The three accounts together (${tk(d.totals.accountsPaisa)}) are equal to the money kept in cash, bKash and bank.`
              : `The three accounts together are ${tk(d.totals.accountsPaisa)} but cash + bKash + bank is ${tk(d.totals.inHandPaisa)}. Tell the developer.`}
          </Note>
        </CardContent>
      </Card>
    </div>
  );
}

function AccountCard({
  a,
  d,
  when,
  cashbookHref,
}: {
  a: FinanceOverview["accounts"][number];
  d: FinanceOverview;
  when: string;
  cashbookHref: string;
}) {
  const notReceived = d.rent.expectedPaisa + d.rent.changedPaisa - d.rent.receivedPaisa;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <FundDot fund={a.fund} />
            {FUND_LABEL[a.fund]}
          </CardTitle>
          <CardDescription>Balance {when}</CardDescription>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={cashbookHref}>Cash book</Link>
        </Button>
      </CardHeader>
      <CardContent>
        <p className={cn("text-[27px] leading-tight font-bold tabular-nums", a.closingPaisa < 0 && "text-bad")}>
          {tk(a.closingPaisa)}
        </p>

        <SubTitle>Money in and out this month</SubTitle>
        <Row label="At the start of the month" value={tk(a.openingPaisa)} />
        <Row label="Students paid" value={signed(a.studentInPaisa)} />
        {(Object.entries(a.movedWith ?? {}) as [Fund, number][])
          .filter(([, amount]) => amount !== 0)
          .map(([other, amount]) => (
            <Row
              key={other}
              label={amount > 0 ? `From ${FUND_LABEL[other]}` : `To ${FUND_LABEL[other]}`}
              hint={
                amount > 0
                  ? `a student's extra money kept there paid their ${FUND_SHORT[a.fund].toLowerCase()} due`
                  : `a student's extra money kept here paid their ${FUND_SHORT[other].toLowerCase()} due`
              }
              value={signed(amount)}
            />
          ))}
        {(() => {
          const named = Object.values(a.movedWith ?? {}).reduce((s, v) => s + (v ?? 0), 0);
          const rest = a.movedPaisa - named;
          return rest !== 0 ? (
            <Row
              label="Student credit moved"
              hint={rest > 0 ? "from another account" : "to another account"}
              value={signed(rest)}
            />
          ) : null;
        })()}
        {a.refundedPaisa !== 0 && <Row label="Given back to students" value={signed(-a.refundedPaisa)} />}
        {a.ownerInPaisa !== 0 && <Row label="Owner put in" value={signed(a.ownerInPaisa)} />}
        <Row label="Expenses" value={signed(-a.expensePaisa)} />
        {a.ownerOutPaisa !== 0 && <Row label="Owner took out" value={signed(-a.ownerOutPaisa)} />}
        <Divider />
        <Row label={`Balance ${when}`} value={tk(a.closingPaisa)} strong />

        <SubTitle>Profit this month</SubTitle>
        <Row
          label="Earned"
          hint={
            a.fund === "meal"
              ? "meals eaten × rate"
              : a.fund === "rent"
                ? "rent charged (advance is not income)"
                : "service & other charges"
          }
          value={tk(a.incomePaisa)}
        />
        <Row label="Spent" value={tk(a.expensePaisa)} />
        <Divider />
        <Row
          label={a.profitPaisa >= 0 ? "Profit" : "Loss"}
          value={tk(Math.abs(a.profitPaisa))}
          tone={a.profitPaisa >= 0 ? "ok" : "bad"}
          strong
        />

        {a.fund === "rent" && (
          <>
            <SubTitle>Rent of this month</SubTitle>
            <Row label={`Expected (${d.rent.tokens} tokens)`} value={tk(d.rent.expectedPaisa)} />
            {d.rent.changedPaisa !== 0 && <Row label="Changed (left / adjusted)" value={signed(d.rent.changedPaisa)} />}
            <Row label="Received" value={tk(d.rent.receivedPaisa)} />
            <Row label="Not received yet" value={tk(notReceived)} tone={notReceived > 0 ? "bad" : undefined} />
            <Divider />
            <Row
              label="Advance held"
              hint="students' money, given back when they leave"
              value={tk(d.rent.advanceHeldPaisa)}
            />
          </>
        )}
        {a.fund === "meal" && (
          <>
            <SubTitle>Meals of this month</SubTitle>
            <Row
              label={`Expected: ${d.meal.expected.meals} meals`}
              hint={`${d.meal.students} students, if nobody turns a meal off`}
              value={tk(d.meal.expected.costPaisa)}
            />
            <Row
              label={`Eaten${d.isCurrent ? " so far" : ""}: ${d.meal.eaten.meals} meals`}
              hint={`= ${formatMealUnits(d.meal.eaten.halfUnits)} full meals (breakfast is half)`}
              value={tk(d.meal.eaten.costPaisa)}
            />
            <Row label="Paid by students for this month" value={tk(d.meal.receivedPaisa)} />
            <Divider />
            <Row
              label="Cost of one full meal"
              hint="meal expenses ÷ full meals eaten"
              value={d.meal.costPerMealPaisa === null ? "—" : tk(d.meal.costPerMealPaisa)}
            />
          </>
        )}
        {a.fund === "service" && (
          <>
            <SubTitle>Charges of this month</SubTitle>
            <Row label="Charged" value={tk(d.service.chargedPaisa)} />
            <Row label="Received" value={tk(d.service.receivedPaisa)} />
          </>
        )}

        <SubTitle>Students, right now</SubTitle>
        <Row
          label="Still to pay into this account"
          value={tk(a.dueNowPaisa)}
          tone={a.dueNowPaisa > 0 ? "bad" : undefined}
        />
        {a.creditNowPaisa !== 0 && <Row label="Paid ahead / to give back" value={tk(a.creditNowPaisa)} />}

        {a.expenses.length > 0 && (
          <>
            <SubTitle>Spent on</SubTitle>
            {a.expenses.map((e) => (
              <Row key={e.name} label={e.name} value={tk(e.amountPaisa)} />
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Expenses & owner money
// ---------------------------------------------------------------------------

const KIND_BADGE = {
  expense: { label: "Expense", variant: "secondary" },
  owner_withdraw: { label: "Owner took", variant: "warn" },
  owner_deposit: { label: "Owner put in", variant: "info" },
} as const;

async function Expenses({ actor, period }: { actor: SessionUser; period: Period }) {
  const [entries, categories, accounts, buildings] = await Promise.all([
    listFinanceEntries(actor, { period }),
    listExpenseCategories(actor),
    listPaymentAccounts(actor),
    listBuildings(actor),
  ]);
  const live = entries.filter((e) => !e.voidedAt);
  const spent = live.filter((e) => e.kind === "expense").reduce((s, e) => s + e.amountPaisa, 0);

  return (
    <div className="grid gap-5 xl:grid-cols-5">
      <Card className="h-fit xl:col-span-2">
        <CardHeader>
          <div>
            <CardTitle>New entry</CardTitle>
            <CardDescription>Every expense is taken out of one of the three accounts.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <p className="text-sm">Add a payment account first (Settings → Where money is received).</p>
          ) : (
            <EntryForm
              categories={categories}
              accounts={accounts.map((a) => ({ id: a.id, name: a.name, method: a.method }))}
              buildings={buildings.filter((b) => b.isActive).map((b) => ({ id: b.id, code: b.code }))}
            />
          )}
        </CardContent>
      </Card>

      <Card className="xl:col-span-3">
        <CardHeader>
          <div>
            <CardTitle>Entries of {formatPeriod(period)}</CardTitle>
            <CardDescription>
              {live.length} entries · expenses {tk(spent)}. A wrong entry is cancelled, never deleted.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-muted-foreground py-4 text-sm">Nothing typed for this month yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Paid from</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id} className={e.voidedAt ? "opacity-60" : undefined}>
                    <TableCell className="tabular-nums">
                      {formatDate(e.entryDate)}
                      <span className="text-muted-foreground block font-mono text-xs">{e.voucherNo}</span>
                    </TableCell>
                    <TableCell className="max-w-64 whitespace-normal">
                      <span className="font-medium">{e.title}</span>{" "}
                      {e.voidedAt ? (
                        <Badge variant="destructive">Cancelled</Badge>
                      ) : (
                        e.kind !== "expense" && (
                          <Badge variant={KIND_BADGE[e.kind].variant}>{KIND_BADGE[e.kind].label}</Badge>
                        )
                      )}
                      <span className="text-muted-foreground block text-xs">
                        {[
                          e.category,
                          e.buildingCode && `Building ${e.buildingCode}`,
                          e.note,
                          e.byName && `by ${e.byName}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        {e.voidedAt && ` · cancelled: ${e.voidReason}`}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <FundDot fund={e.fund} />
                        {FUND_SHORT[e.fund]}
                      </span>
                    </TableCell>
                    <TableCell>{e.accountName}</TableCell>
                    <TableCell
                      className={cn("text-right font-semibold tabular-nums", e.voidedAt && "font-normal line-through")}
                    >
                      {tk(e.amountPaisa)}
                    </TableCell>
                    <TableCell className="text-right">{!e.voidedAt && <VoidEntry entryId={e.id} />}</TableCell>
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

// ---------------------------------------------------------------------------
// Cash book
// ---------------------------------------------------------------------------

async function Cashbook({
  actor,
  period,
  fund,
  href,
}: {
  actor: SessionUser;
  period: Period;
  fund: Fund;
  href: (p: { fund?: Fund }) => string;
}) {
  const book = await getCashbook(actor, fund, period);
  // Running balance after each line, oldest first.
  const balances: number[] = [];
  book.rows.reduce((bal, r) => {
    balances.push(bal + r.amountPaisa);
    return bal + r.amountPaisa;
  }, book.openingPaisa);
  const moneyIn = book.rows.filter((r) => r.amountPaisa > 0).reduce((s, r) => s + r.amountPaisa, 0);
  const moneyOut = -book.rows.filter((r) => r.amountPaisa < 0).reduce((s, r) => s + r.amountPaisa, 0);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <FundDot fund={fund} />
            {FUND_LABEL[fund]} · {formatPeriod(period)}
          </CardTitle>
          <CardDescription>Every taka that went into or out of this account, day by day.</CardDescription>
        </div>
        <TabsNav
          items={FUNDS.map((f) => ({ key: f, label: FUND_SHORT[f], href: href({ fund: f }), active: f === fund }))}
        />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>What</TableHead>
              <TableHead>No.</TableHead>
              <TableHead className="text-right">In</TableHead>
              <TableHead className="text-right">Out</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-surface-2 font-semibold">
              <TableCell colSpan={5}>Balance at the start of the month</TableCell>
              <TableCell className="text-right tabular-nums">{tk(book.openingPaisa)}</TableCell>
            </TableRow>
            {book.rows.map((r, i) => (
              <TableRow key={r.key}>
                <TableCell className="tabular-nums">{formatDate(r.date)}</TableCell>
                <TableCell className="max-w-80 whitespace-normal">
                  {r.text}
                  {r.detail && <span className="text-muted-foreground ml-1.5 text-xs">{r.detail}</span>}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {r.href ? (
                    <Link href={r.href} target="_blank" className="text-brand hover:underline">
                      {r.ref}
                    </Link>
                  ) : (
                    r.ref
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.amountPaisa > 0 ? tk(r.amountPaisa) : ""}</TableCell>
                <TableCell className="text-right tabular-nums">{r.amountPaisa < 0 ? tk(-r.amountPaisa) : ""}</TableCell>
                <TableCell className={cn("text-right tabular-nums", balances[i] < 0 && "text-bad")}>
                  {tk(balances[i])}
                </TableCell>
              </TableRow>
            ))}
            {book.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-5 text-center">
                  No money moved in this account this month.
                </TableCell>
              </TableRow>
            )}
            <TableRow className="bg-surface-2 font-bold">
              <TableCell colSpan={3}>Total · balance on {formatDate(book.asOf)}</TableCell>
              <TableCell className="text-right tabular-nums">{tk(moneyIn)}</TableCell>
              <TableCell className="text-right tabular-nums">{tk(moneyOut)}</TableCell>
              <TableCell className="text-right tabular-nums">{tk(book.closingPaisa)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Profit & loss + balance sheet
// ---------------------------------------------------------------------------

function StatementRow({
  label,
  month,
  all,
  strong,
  indent,
  profit,
}: {
  label: React.ReactNode;
  month: number | null;
  all: number | null;
  strong?: boolean;
  indent?: boolean;
  profit?: boolean;
}) {
  const cell = (v: number | null) => (v === null ? "" : profit && v < 0 ? `−${formatTaka(-v)}` : formatTaka(v));
  const tone = (v: number | null) => (profit && v !== null ? (v < 0 ? "text-bad" : "text-ok") : undefined);
  return (
    <TableRow className={strong ? "bg-surface-2 font-bold" : undefined}>
      <TableCell className={cn("whitespace-normal", indent && "pl-7")}>{label}</TableCell>
      <TableCell className={cn("text-right tabular-nums", tone(month))}>{cell(month)}</TableCell>
      <TableCell className={cn("text-right tabular-nums", tone(all))}>{cell(all)}</TableCell>
    </TableRow>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={3} className="text-muted-foreground pt-4 text-[11.5px] font-semibold tracking-wide uppercase">
        {children}
      </TableCell>
    </TableRow>
  );
}

async function StatementsView({ actor, period }: { actor: SessionUser; period: Period }) {
  const [s, order] = await Promise.all([getStatements(actor, period), getPaymentOrder(db(), actor.orgId)]);
  const pl = s.profitLoss;
  const bs = s.balanceSheet;
  const total = (rows: { monthPaisa: number; allPaisa: number }[], key: "monthPaisa" | "allPaisa") =>
    rows.reduce((sum, r) => sum + r[key], 0);
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="h-fit">
        <CardHeader>
          <div>
            <CardTitle>Profit &amp; loss</CardTitle>
            <CardDescription>
              What the hostel earned and spent. Advance and the owner&apos;s own money are not counted here.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {pl.ratesMissing && (
            <Note variant="warn" className="mb-3">
              Some months have meals but no meal rates in Settings; their meal income counts as ৳0.
            </Note>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead className="text-right">{formatPeriod(period)}</TableHead>
                <TableHead className="text-right">From the start</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <Section>Earned</Section>
              <StatementRow label="Rent charged" month={pl.income[0].monthPaisa} all={pl.income[0].allPaisa} indent />
              <StatementRow
                label={`Meals eaten (${pl.mealsEaten.meals} this month)`}
                month={pl.mealsEaten.monthPaisa}
                all={pl.mealsEaten.allPaisa}
                indent
              />
              {(pl.otherMeal.month !== 0 || pl.otherMeal.all !== 0) && (
                <StatementRow
                  label="Other meal charges / discounts"
                  month={pl.otherMeal.month}
                  all={pl.otherMeal.all}
                  indent
                  profit
                />
              )}
              <StatementRow
                label="Service & other charges"
                month={pl.income[2].monthPaisa}
                all={pl.income[2].allPaisa}
                indent
              />
              <StatementRow
                label="Total earned"
                month={total(pl.income, "monthPaisa")}
                all={total(pl.income, "allPaisa")}
                strong
              />

              <Section>Spent</Section>
              {pl.expenses.length === 0 && (
                <StatementRow label="No expenses typed yet" month={null} all={null} indent />
              )}
              {pl.expenses.map((e) => (
                <StatementRow
                  key={`${e.fund}-${e.name}`}
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      <FundDot fund={e.fund} />
                      {e.name}
                      <span className="text-muted-foreground text-xs">{FUND_SHORT[e.fund]}</span>
                    </span>
                  }
                  month={e.monthPaisa}
                  all={e.allPaisa}
                  indent
                />
              ))}
              <StatementRow
                label="Total spent"
                month={total(pl.expenseByFund, "monthPaisa")}
                all={total(pl.expenseByFund, "allPaisa")}
                strong
              />

              <Section>Profit (earned − spent)</Section>
              {pl.profitByFund.map((p) => (
                <StatementRow
                  key={p.fund}
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      <FundDot fund={p.fund} />
                      {FUND_LABEL[p.fund]}
                    </span>
                  }
                  month={p.monthPaisa}
                  all={p.allPaisa}
                  indent
                  profit
                />
              ))}
              <StatementRow label="Profit / loss" month={pl.profitMonthPaisa} all={pl.profitAllPaisa} strong profit />
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <div>
            <CardTitle>Balance sheet · {formatDate(s.asOf)}</CardTitle>
            <CardDescription>What the hostel has, what it owes, and what is left for the owner.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <SubTitle>What the hostel has</SubTitle>
          {bs.wallets
            .filter((w) => w.closingPaisa !== 0)
            .map((w) => (
              <Row key={w.id} label={w.name} value={tk(w.closingPaisa)} />
            ))}
          <Row
            label="Students still have to pay"
            hint="bills of months up to this one"
            value={tk(bs.receivablePaisa)}
          />
          {bs.mealNotBilledPaisa > 0 && (
            <Row
              label="Meals eaten, not billed yet"
              hint="goes on the next token as Pre meal"
              value={tk(bs.mealNotBilledPaisa)}
            />
          )}
          <Divider />
          <Row label="Total" value={tk(bs.assetsPaisa)} strong />

          <SubTitle>What the hostel owes</SubTitle>
          <Row label="Students' advance" hint="given back when they leave" value={tk(bs.advancePaisa)} />
          <Row label="Students paid ahead" hint="extra paid, or money to give back" value={tk(bs.studentCreditPaisa)} />
          {bs.mealAheadPaisa > 0 && (
            <Row
              label="Meal money for days not eaten yet"
              hint="deposit billed for the rest of the month"
              value={tk(bs.mealAheadPaisa)}
            />
          )}
          <Divider />
          <Row label="Total" value={tk(bs.liabilitiesPaisa)} strong />

          <SubTitle>What is left for the owner</SubTitle>
          <Row label="Profit from the start" value={signed(bs.profitAllPaisa)} />
          {bs.ownerInPaisa !== 0 && <Row label="Owner put in" value={signed(bs.ownerInPaisa)} />}
          {bs.ownerOutPaisa !== 0 && <Row label="Owner took out" value={signed(-bs.ownerOutPaisa)} />}
          {bs.openingPaisa !== 0 && (
            <Row
              label="Balances from before the software"
              hint="dues and money typed at import"
              value={signed(bs.openingPaisa)}
            />
          )}
          <Divider />
          <Row label="Has − owes" value={signed(bs.equityPaisa)} strong tone={bs.equityPaisa < 0 ? "bad" : "ok"} />

          <Note variant={bs.differencePaisa === 0 ? "ok" : "bad"} className="mt-3">
            {bs.differencePaisa === 0
              ? "✓ The books agree: what the hostel has minus what it owes is exactly the profit plus the owner's money."
              : `The books are off by ${tk(Math.abs(bs.differencePaisa))}. Tell the developer.`}
          </Note>
          <p className="text-muted-foreground mt-3 text-[12px]">
            A payment fills the accounts in this order: {fundOrderLabel(order)} (Settings).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
