import { Download } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Note } from "@/components/ui/note";
import { formatDate, formatPeriod, periodEnd, type Period } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/server/auth/session";
import { FUND_COLOR, FUND_LABEL, FUNDS, type Fund } from "@/server/domain/finance";
import type { StatementLine } from "@/server/domain/income-statement";
import { getIncomeStatement, type IncomeStatement } from "@/server/services/finance";

/**
 * Income statement in the usual accounting layout (like a printed / Excel statement):
 * INCOME lines → Total income, EXPENSES lines → Total expenses, then Net profit (loss).
 * One account at a time (Rent & advance, Meal, Service) or all accounts together.
 */

export type StatementAccount = Fund | "all";
export type StatementScope = "month" | "all";

export const STATEMENT_ACCOUNTS: { key: StatementAccount; label: string }[] = [
  ...FUNDS.map((f) => ({ key: f as StatementAccount, label: FUND_LABEL[f] })),
  { key: "all", label: "All accounts" },
];

export function parseStatementParams(p: { acct?: string; scope?: string }) {
  const account = (STATEMENT_ACCOUNTS.find((a) => a.key === p.acct)?.key ?? "rent") as StatementAccount;
  const scope: StatementScope = p.scope === "all" ? "all" : "month";
  return { account, scope };
}

/** Accounting style: 1,49,900.00 and a negative amount in brackets (40,700.00). */
const amt = (paisa: number) => {
  const t = formatTaka(Math.abs(paisa), { symbol: false, alwaysDecimals: true });
  return paisa < 0 ? `(${t})` : t;
};

type Row = { key: string; label: string; note?: string; paisa: number };

function pick(lines: StatementLine[], scope: StatementScope): Row[] {
  return lines
    .map((l) => ({
      key: l.key,
      label: l.label,
      // The meals note counts this month's meals only.
      note: scope === "all" && l.key.startsWith("meals") ? undefined : l.note,
      paisa: scope === "month" ? l.monthPaisa : l.allPaisa,
    }))
    .filter((r) => r.paisa !== 0);
}

/** All accounts together: lines with the same name are added up. */
function merge(lists: StatementLine[][]): StatementLine[] {
  const out: StatementLine[] = [];
  for (const l of lists.flat()) {
    const same = out.find((x) => x.label === l.label);
    if (same) {
      same.monthPaisa += l.monthPaisa;
      same.allPaisa += l.allPaisa;
    } else out.push({ ...l, key: `${l.key}-${out.length}` });
  }
  return out;
}

export function statementOf(s: Pick<IncomeStatement, "accounts">, account: StatementAccount, scope: StatementScope) {
  const accounts = account === "all" ? s.accounts : s.accounts.filter((a) => a.fund === account);
  const income = pick(merge(accounts.map((a) => a.income)), scope);
  const expenses = pick(merge(accounts.map((a) => a.expenses)), scope);
  const totalIncome = income.reduce((t, r) => t + r.paisa, 0);
  const totalExpenses = expenses.reduce((t, r) => t + r.paisa, 0);
  return { income, expenses, totalIncome, totalExpenses, net: totalIncome - totalExpenses };
}

// ---------------------------------------------------------------------------
// Rows of the statement: label | amount of each line | totals
// ---------------------------------------------------------------------------

const GRID =
  "grid grid-cols-[minmax(0,1fr)_5.6rem_6.2rem] sm:grid-cols-[minmax(0,1fr)_9.5rem_9.5rem] items-baseline gap-x-2 sm:gap-x-3";

function Section({ children }: { children: React.ReactNode }) {
  return <div className="text-ink pt-6 pb-1 text-[15px] font-extrabold tracking-[0.04em] uppercase">{children}</div>;
}

function Item({ row, last }: { row: Row; last: boolean }) {
  return (
    <div className={cn(GRID, "py-[5px]")}>
      <div className="text-ink-2 min-w-0 pl-3 text-[13px] sm:pl-8 sm:text-[14px]">
        {row.label}
        {row.note && <span className="text-muted-foreground ml-2 hidden text-[11.5px] md:inline">({row.note})</span>}
      </div>
      <div
        className={cn(
          "text-ink text-right text-[13px] tabular-nums sm:text-[14px]",
          last && "border-ink border-b pb-1",
        )}
      >
        {amt(row.paisa)}
      </div>
      <div />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className={cn(GRID, "py-[5px]")}>
      <div className="text-muted-foreground pl-3 text-[13px] italic sm:pl-8">{text}</div>
      <div className="border-ink text-muted-foreground border-b pb-1 text-right text-[14px] tabular-nums">{amt(0)}</div>
      <div />
    </div>
  );
}

function Total({ label, paisa, line }: { label: string; paisa: number; line?: "single" | "double" }) {
  return (
    <div className={cn(GRID, "py-[6px]")}>
      <div className="text-ink text-[13.5px] font-bold sm:text-[14.5px]">{label}</div>
      <div />
      <div
        className={cn(
          "text-ink text-right text-[13.5px] font-bold tabular-nums sm:text-[14.5px]",
          line === "single" && "border-ink border-b pb-1",
          line === "double" && "border-ink border-b-[3px] border-double pb-1",
        )}
      >
        {amt(paisa)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export async function IncomeStatementView({
  actor,
  period,
  account,
  scope,
  href,
}: {
  actor: SessionUser;
  period: Period;
  account: StatementAccount;
  scope: StatementScope;
  href: (p: { acct?: StatementAccount; scope?: StatementScope }) => string;
}) {
  const s = await getIncomeStatement(actor, period);
  const st = statementOf(s, account, scope);
  const accountName = STATEMENT_ACCOUNTS.find((a) => a.key === account)!.label;
  const upTo = s.asOf < periodEnd(period) ? ` (up to ${formatDate(s.asOf)})` : "";
  const when =
    scope === "month"
      ? `For the month of ${formatPeriod(period)}${upTo}`
      : `From the start up to ${formatDate(s.asOf)}`;

  return (
    <div className="flex flex-col gap-4">
      {/* Choose the account and the time span */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Account" className="border-line bg-surface flex flex-wrap gap-1 rounded-[11px] border p-1">
            {STATEMENT_ACCOUNTS.map((a) => {
              const active = a.key === account;
              return (
                <Link
                  key={a.key}
                  href={href({ acct: a.key })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-[8px] px-3 py-1.5 text-[13px] font-semibold transition-colors",
                    active ? "bg-brand text-white shadow-sm" : "text-ink-2 hover:bg-surface-2",
                  )}
                >
                  {a.key !== "all" && (
                    <span
                      aria-hidden
                      className={cn("size-2 rounded-full", active && "ring-2 ring-white/70")}
                      style={{ background: FUND_COLOR[a.key] }}
                    />
                  )}
                  {a.label}
                </Link>
              );
            })}
          </nav>
          <nav aria-label="Time span" className="border-line bg-surface flex gap-1 rounded-[11px] border p-1">
            {(
              [
                ["month", formatPeriod(period)],
                ["all", "Since the start"],
              ] as const
            ).map(([k, label]) => (
              <Link
                key={k}
                href={href({ scope: k })}
                aria-current={k === scope ? "page" : undefined}
                className={cn(
                  "rounded-[8px] px-3 py-1.5 text-[13px] font-semibold transition-colors",
                  k === scope ? "bg-surface-3 text-ink" : "text-muted-foreground hover:bg-surface-2",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <Button asChild variant="outline" className="ml-auto gap-1.5">
          <a href={`/api/finance/income-statement?month=${s.period}`}>
            <Download className="size-4" />
            Download Excel
          </a>
        </Button>
      </div>

      {s.ratesMissing && (
        <Note variant="warn">Some months have meals but no meal rates in Settings; their meal income counts as 0.</Note>
      )}

      {/* The statement itself */}
      <article className="bg-surface shadow-card mx-auto w-full max-w-[860px] overflow-hidden rounded-[6px] border-[3px] border-[#1b2559]">
        <header className="bg-[#1b2559] px-5 py-6 text-center text-white sm:py-7">
          <p className="text-[19px] font-extrabold tracking-[0.03em] uppercase sm:text-[24px]">{actor.orgName}</p>
          <p className="mt-1 text-[16px] font-bold sm:text-[19px]">Income Statement · {accountName}</p>
          <p className="mt-0.5 text-[14px] font-semibold sm:text-[16px]">{when}</p>
          <p className="mt-1 text-[12.5px] text-white/85 italic">(Amounts in Taka)</p>
        </header>

        <div className="px-3 pt-1 pb-7 sm:px-8">
          <Section>Income</Section>
          {st.income.length === 0 ? (
            <Empty text="No income" />
          ) : (
            st.income.map((r, i) => <Item key={r.key} row={r} last={i === st.income.length - 1} />)
          )}
          <Total label="Total income" paisa={st.totalIncome} />

          <Section>Expenses</Section>
          {st.expenses.length === 0 ? (
            <Empty text="No expenses" />
          ) : (
            st.expenses.map((r, i) => <Item key={r.key} row={r} last={i === st.expenses.length - 1} />)
          )}
          <Total label="Total expenses" paisa={st.totalExpenses} line="single" />

          <div className="h-2" />
          <Total label={st.net >= 0 ? "Net profit" : "Net loss"} paisa={st.net} line="double" />
        </div>
      </article>

      <p className="text-muted-foreground mx-auto w-full max-w-[860px] text-[12px] leading-relaxed">
        Income is what the account charged; meal income is the meals actually eaten × the meal rates. Advance, meal
        deposits and the owner&apos;s own money are not income. Expenses are the ones typed in Finance for the account.
        Amounts in brackets are negative.
      </p>
    </div>
  );
}
