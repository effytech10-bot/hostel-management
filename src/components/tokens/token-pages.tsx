import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { currentPeriod, dhakaDate, formatPeriod, isValidPeriod } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import type { SessionUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { listBuildings } from "@/server/services/buildings";
import { planTokenRun } from "@/server/services/token-engine";
import {
  findLatestToken,
  getPrintableTokens,
  getTokenView,
  listBillingPeriods,
  listTokens,
} from "@/server/services/tokens";
import { TokenCard } from "./token-card";
import { MonthEndButton } from "./month-end-button";
import { TokenPaymentForm } from "./token-payment-form";
import { TokenStateBadge } from "./token-status";

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

/** Token ID / Student ID / phone → the student's newest token. */
export function TokenSearch({
  action,
  defaultValue,
  error,
}: {
  action: string;
  defaultValue?: string;
  error?: string;
}) {
  return (
    <form method="get" action={action} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          name="find"
          defaultValue={defaultValue}
          placeholder="Token ID, Student ID or phone (e.g. 2610-207601A-001)"
          autoFocus
          className="h-11 sm:max-w-md"
        />
        <Button type="submit" className="h-11">
          Open token
        </Button>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </form>
  );
}

/** Runs the search from ?find=… and opens the newest token. Returns an error message when nothing matched. */
export async function openTokenFromSearch(actor: SessionUser, basePath: string, find: string | undefined) {
  if (!find?.trim()) return undefined;
  let code: string;
  try {
    code = (await findLatestToken(actor, find)).code;
  } catch (e) {
    if (e instanceof AppError) return e.message;
    throw e;
  }
  redirect(`${basePath}/${encodeURIComponent(code)}`);
}

// ---------------------------------------------------------------------------
// The monthly run (admin)
// ---------------------------------------------------------------------------

async function TokenRunPanel({ actor, basePath }: { actor: SessionUser; basePath: string }) {
  const period = currentPeriod();
  const plan = await planTokenRun(db(), actor.orgId, period, dhakaDate());
  const nothingToDo = plan.tokens.length === 0 && plan.alreadyClosed;
  const thisMonth = plan.tokens.reduce((s, t) => s + t.currentTotalPaisa, 0);
  const total = plan.tokens.reduce((s, t) => s + t.totalPaisa, 0);

  return (
    <Card className="border-primary/40 mb-6">
      <CardHeader>
        <CardTitle>Tokens for {formatPeriod(period)}</CardTitle>
        <CardDescription>
          Every student gets one token a month. It is made by itself on the 1st at 12:05 AM once the first run has been
          done here. Students whose {formatPeriod(period)} token was already made (at admission or early) are skipped.
          {!plan.alreadyClosed && ` ${formatPeriod(plan.closePeriod)} is locked when this runs.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label="New tokens" value={plan.tokens.length} />
          <Stat label="Already made" value={plan.tokensAlreadyMade} />
          <Stat label="This month's charges" value={formatTaka(thisMonth)} />
          <Stat label="Total (with dues)" value={formatTaka(total)} />
        </div>
        {plan.tokens.length > 0 && (
          <details>
            <summary className="text-primary cursor-pointer text-sm select-none">
              Preview every token ({plan.tokens.length})
            </summary>
            <Table className="mt-2">
              <TableHeader>
                <TableRow>
                  <TableHead>Token ID</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead className="text-right">This month</TableHead>
                  <TableHead className="text-right">Pre meal</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plan.tokens.map((t) => (
                  <TableRow key={t.student.studentId}>
                    <TableCell className="font-mono text-xs">{t.code}</TableCell>
                    <TableCell>
                      {t.student.fullName}{" "}
                      <span className="text-muted-foreground text-xs">{t.student.studentCode}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatTaka(t.currentTotalPaisa)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.meal ? formatTaka(t.meal.differencePaisa) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatTaka(t.dueTotalPaisa)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatTaka(t.totalPaisa)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </details>
        )}
        {plan.blockers.length === 0 && !nothingToDo && (
          <MonthEndButton
            period={period}
            label={`Make ${plan.tokens.length} token(s) for ${formatPeriod(period)}`}
            confirmText={`${plan.alreadyClosed ? "" : `${formatPeriod(plan.closePeriod)} will be locked. `}Make ${plan.tokens.length} token(s) for ${formatPeriod(period)}?`}
          />
        )}
        {nothingToDo && (
          <p className="text-muted-foreground text-sm">
            Everything is done for {formatPeriod(period)}.{" "}
            <Link href={`${basePath}?month=${period}`} className="underline">
              See the tokens
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Token list
// ---------------------------------------------------------------------------

const FILTERS = ["due", "unpaid", "partial", "paid", "carried"] as const;

export async function TokensPage({
  actor,
  basePath,
  searchParams,
}: {
  actor: SessionUser;
  basePath: string;
  searchParams: SearchParams;
}) {
  const find = one(searchParams.find);
  const findError = await openTokenFromSearch(actor, basePath, find);

  const monthParam = one(searchParams.month);
  const period = monthParam && isValidPeriod(monthParam) ? monthParam : currentPeriod();
  const buildingParam = one(searchParams.building);
  const buildingList = await listBuildings(actor);
  const buildingId = buildingList.some((b) => b.id === buildingParam) ? buildingParam : undefined;
  const statusParam = one(searchParams.status);
  const filter = FILTERS.find((f) => f === statusParam);
  const [rows, periods] = await Promise.all([listTokens(actor, period, buildingId, filter), listBillingPeriods(actor)]);
  const total = rows.reduce((s, r) => s + r.totalPaisa, 0);
  const paid = rows.reduce((s, r) => s + r.paidHerePaisa, 0);
  const remaining = rows.filter((r) => r.state !== "carried").reduce((s, r) => s + r.remainingPaisa, 0);
  const counts = { paid: 0, partial: 0, unpaid: 0, carried: 0 };
  for (const r of rows) counts[r.state]++;
  const studentsPath = basePath.replace("/tokens", "/students");
  const printHref = `/print/tokens?${new URLSearchParams({ month: period, ...(buildingId ? { building: buildingId } : {}) })}`;

  return (
    <>
      <PageHeader title="Tokens" description="One token per student per month. Payments are taken on the token.">
        {rows.length > 0 && (
          <Button asChild variant="outline">
            <Link href={printHref} target="_blank">
              Print {rows.length} token(s)
            </Link>
          </Button>
        )}
      </PageHeader>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Find a token</CardTitle>
          <CardDescription>Any of a student&apos;s token IDs opens their newest token.</CardDescription>
        </CardHeader>
        <CardContent>
          <TokenSearch action={basePath} defaultValue={find} error={findError} />
        </CardContent>
      </Card>

      {actor.role === "admin" && <TokenRunPanel actor={actor} basePath={basePath} />}

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
        <Select name="status" defaultValue={filter ?? ""} className="w-auto min-w-40">
          <option value="">All</option>
          <option value="due">Not fully paid</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partly paid</option>
          <option value="paid">Paid</option>
          <option value="carried">Carried</option>
        </Select>
        <Button type="submit" variant="outline">
          Show
        </Button>
      </form>

      {rows.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label={`Tokens (${formatPeriod(period)})`} value={formatTaka(total)} />
          <Stat label="Paid on these tokens" value={formatTaka(paid)} />
          <Stat label="Still to collect" value={formatTaka(remaining)} />
          <Stat
            label="Paid · Partly · Unpaid · Carried"
            value={`${counts.paid} · ${counts.partial} · ${counts.unpaid} · ${counts.carried}`}
          />
        </div>
      )}

      <Card className="py-0">
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <p className="text-muted-foreground p-6 text-sm">No tokens for {formatPeriod(period)}.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token ID</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead className="text-right">This month</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Left</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {r.code ? (
                        <Link href={`${basePath}/${r.code}`} className="text-primary hover:underline">
                          {r.code}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {r.early && (
                        <Badge variant="outline" className="ml-2">
                          Early
                        </Badge>
                      )}
                      {r.kind === "admission" && (
                        <Badge variant="outline" className="ml-2">
                          Admission
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link href={`${studentsPath}/${r.studentId}`} className="font-medium hover:underline">
                        {r.fullName}
                      </Link>{" "}
                      <span className="text-muted-foreground text-xs">{r.studentCode}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatTaka(r.currentTotalPaisa)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTaka(r.previousTotalPaisa)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatTaka(r.totalPaisa)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTaka(r.paidHerePaisa)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.state === "carried" ? "—" : formatTaka(r.remainingPaisa)}
                    </TableCell>
                    <TableCell>
                      <TokenStateBadge state={r.state} />
                    </TableCell>
                  </TableRow>
                ))}
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
              {p.closedAt ? " (locked)" : ""}
            </span>
          ))}
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// One token
// ---------------------------------------------------------------------------

export async function TokenDetailPage({
  actor,
  basePath,
  code,
}: {
  actor: SessionUser;
  basePath: string;
  code: string;
}) {
  let view;
  try {
    view = await getTokenView(actor, decodeURIComponent(code));
  } catch (e) {
    if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
  const { token, student } = view;
  const printable = await getPrintableTokens(actor, { tokenId: token.id });
  const isStaff = actor.role === "admin" || actor.role === "cashier";
  const studentsPath = basePath.replace("/tokens", "/students");
  const extraPaisa = view.isLatest ? Math.max(0, view.paidHerePaisa - token.totalPaisa) : 0;

  return (
    <>
      {isStaff && (
        <p className="mb-2 text-sm">
          <Link href={basePath} className="text-muted-foreground hover:underline">
            ← Tokens
          </Link>
        </p>
      )}
      <PageHeader
        title={token.code ?? "Token"}
        description={`${formatPeriod(token.period)} · ${student.name} · ID ${student.code}${view.buildingCode ? ` · ${view.buildingCode}` : ""}${token.seatText ? ` · ${token.seatText.replace(/^.*? · /, "")}` : ""}`}
      >
        <Button asChild variant="outline">
          <Link href={`/print/tokens?token=${token.id}`} target="_blank">
            Print
          </Link>
        </Button>
        {isStaff && (
          <Button asChild variant="outline">
            <Link href={`${studentsPath}/${student.id}`}>Student</Link>
          </Button>
        )}
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TokenStateBadge state={view.state} />
        {token.early && <Badge variant="outline">Made early</Badge>}
        {token.kind === "admission" && <Badge variant="outline">Admission token</Badge>}
      </div>

      {!view.isLatest && view.latestCode && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          This is an older token. Anything unpaid here was moved to the newest token{" "}
          <Link href={`${basePath}/${view.latestCode}`} className="font-semibold underline">
            {view.latestCode}
          </Link>
          {isStaff ? ". Take payments there." : "."}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="flex flex-col gap-6 lg:col-span-3">
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <TokenCard token={printable.tokens[0]} orgName={actor.orgName} accounts={printable.accounts} />
            </div>
          </div>
          {extraPaisa > 0 && (
            <p className="text-sm text-emerald-700">
              {formatTaka(extraPaisa)} extra paid. It will show as &quot;Extra Paid&quot; on the next token.
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Payment details</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {view.payments.length === 0 ? (
                <p className="text-muted-foreground px-6 text-sm">No payment yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Received in</TableHead>
                      <TableHead>TrxID</TableHead>
                      <TableHead>By</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {view.payments.map((p) => (
                      <TableRow key={p.id} className={p.voidedAt ? "opacity-60" : undefined}>
                        <TableCell className="tabular-nums">
                          <Link href={`/receipts/${p.id}`} target="_blank" className="text-primary hover:underline">
                            {p.paidDate}
                          </Link>
                          <span className="text-muted-foreground ml-1 text-xs">{p.receiptNo}</span>
                          {p.voidedAt && (
                            <Badge variant="destructive" className="ml-2">
                              Void
                            </Badge>
                          )}
                          {p.note && <p className="text-muted-foreground text-xs">{p.note}</p>}
                        </TableCell>
                        <TableCell>{p.accountName}</TableCell>
                        <TableCell className="font-mono text-xs">{p.trxId ?? ""}</TableCell>
                        <TableCell className="text-muted-foreground">{p.receivedByName ?? ""}</TableCell>
                        <TableCell
                          className={p.voidedAt ? "text-right tabular-nums line-through" : "text-right tabular-nums"}
                        >
                          {formatTaka(p.amountPaisa)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {isStaff && view.isLatest && (
          <Card className="h-fit lg:col-span-2">
            <CardHeader>
              <CardTitle>Take payment</CardTitle>
              <CardDescription>Any amount. Pay as many times as needed on this token.</CardDescription>
            </CardHeader>
            <CardContent>
              {view.accounts.length === 0 ? (
                <p className="text-sm">
                  Add a payment account first{actor.role === "admin" ? " (Settings → Payment accounts)" : ""}.
                </p>
              ) : (
                <TokenPaymentForm
                  studentId={student.id}
                  tokenCode={token.code ?? ""}
                  remainingPaisa={view.remainingPaisa}
                  accounts={view.accounts.map((a) => ({ id: a.id, name: a.name, method: a.method }))}
                />
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
