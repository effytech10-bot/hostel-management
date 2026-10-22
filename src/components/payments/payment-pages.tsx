import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { KpiTile } from "@/components/ui/kpi";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dhakaDate } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import { parseDateParam } from "@/lib/validation/payments";
import type { SessionUser } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { listBuildings } from "@/server/services/buildings";
import { listCollections, listPaymentAccounts } from "@/server/services/payments";
import { getStudentDetail, listStudents } from "@/server/services/students";
import { openTokenFromSearch, TokenSearch } from "@/components/tokens/token-pages";

type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Collection list (daily collection report)
// ---------------------------------------------------------------------------

export async function PaymentsListPage({
  actor,
  basePath,
  searchParams,
}: {
  actor: SessionUser;
  basePath: string;
  searchParams: SearchParams;
}) {
  const today = dhakaDate();
  const from = parseDateParam(one(searchParams.from), today);
  const to = parseDateParam(one(searchParams.to), from > today ? from : today);
  const buildingParam = one(searchParams.building);
  const accountParam = one(searchParams.account);

  const [buildingList, accounts] = await Promise.all([
    listBuildings(actor),
    listPaymentAccounts(actor, { includeInactive: true }),
  ]);
  const buildingId = buildingList.some((b) => b.id === buildingParam) ? buildingParam : undefined;
  const accountId = accounts.some((a) => a.id === accountParam) ? accountParam : undefined;
  const { rows, totals } = await listCollections(actor, { from, to, buildingId, accountId });

  return (
    <>
      <PageHeader
        title="Payments"
        description={from === to ? `Collection on ${from}` : `Collection from ${from} to ${to}`}
      >
        <Button asChild>
          <Link href={`${basePath}/new`}>+ Take payment</Link>
        </Button>
      </PageHeader>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2.5">
        <div className="flex flex-col gap-1">
          <label className="text-[12.5px] font-semibold text-ink-2">From</label>
          <Input type="date" name="from" defaultValue={from} className="w-auto h-9 text-[13.5px]" aria-label="From" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[12.5px] font-semibold text-ink-2">To</label>
          <Input type="date" name="to" defaultValue={to} className="w-auto h-9 text-[13.5px]" aria-label="To" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[12.5px] font-semibold text-ink-2">Building</label>
          <Select name="building" defaultValue={buildingId ?? ""} className="w-auto min-w-36 h-9 text-[13.5px]">
            <option value="">All buildings</option>
            {buildingList.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[12.5px] font-semibold text-ink-2">Account</label>
          <Select name="account" defaultValue={accountId ?? ""} className="w-auto min-w-44 h-9 text-[13.5px]">
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="outline" size="sm" className="h-9">
          Show
        </Button>
      </form>

      <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 min-[1180px]:grid-cols-4 gap-3.5">
        <KpiTile
          label={`Total collected (${totals.count})`}
          value={formatTaka(totals.totalPaisa)}
        />
        {totals.byAccount.map((a) => (
          <KpiTile
            key={a.accountName}
            label={`${a.accountName} (${a.count})`}
            value={formatTaka(a.totalPaisa)}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Receipts</CardTitle>
            <CardDescription>Newest first. Tap a receipt number to open.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-muted-foreground p-6 text-sm">No payments in this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Building</TableHead>
                  <TableHead>Received in</TableHead>
                  <TableHead>TrxID</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className={r.voidedAt ? "opacity-60" : undefined}>
                    <TableCell>
                      <Link
                        href={`/receipts/${r.id}`}
                        target="_blank"
                        className="text-brand font-bold hover:underline font-mono"
                      >
                        {r.receiptNo}
                      </Link>
                      {r.voidedAt && (
                        <Badge variant="destructive" className="ml-1.5">
                          Void
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{r.paidDate}</TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {r.tokenCode ? (
                        <Link
                          href={`${basePath.replace("/payments", "/tokens")}/${r.tokenCode}`}
                          className="text-brand hover:underline"
                        >
                          {r.tokenCode}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`${basePath.replace("/payments", "/students")}/${r.studentId}`}
                        className="font-semibold text-ink hover:underline"
                      >
                        {r.studentName}
                      </Link>{" "}
                      <span className="text-muted-foreground text-xs font-mono">{r.studentCode}</span>
                    </TableCell>
                    <TableCell>{r.buildingCode ?? "—"}</TableCell>
                    <TableCell>{r.accountName}</TableCell>
                    <TableCell className="font-mono text-xs">{r.trxId ?? ""}</TableCell>
                    <TableCell className="text-muted-foreground">{r.receivedByName ?? ""}</TableCell>
                    <TableCell
                      className={r.voidedAt ? "text-right tabular-nums line-through" : "text-right font-semibold tabular-nums"}
                    >
                      {formatTaka(r.amountPaisa)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Take a payment: find the student's newest token, payments are taken there
// ---------------------------------------------------------------------------

export async function TakePaymentPage({
  actor,
  basePath,
  searchParams,
}: {
  actor: SessionUser;
  basePath: string;
  searchParams: SearchParams;
}) {
  const tokensPath = basePath.replace("/payments", "/tokens");
  const studentParam = one(searchParams.student);
  if (studentParam && UUID_RE.test(studentParam)) {
    let studentCode: string | null = null;
    try {
      studentCode = (await getStudentDetail(actor, studentParam)).student.studentCode;
    } catch (e) {
      if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
      throw e;
    }
    redirect(`${basePath}/new?find=${encodeURIComponent(studentCode)}`);
  }

  const find = one(searchParams.find);
  const findError = await openTokenFromSearch(actor, tokensPath, find);
  // Nothing matched exactly: try a name / room search.
  const results = find && findError ? await listStudents(actor, { q: find, status: "all" }) : null;

  return (
    <>
      <PageHeader
        title="Take payment"
        description="Type the token ID (or Student ID / phone). The student's newest token opens and the payment is taken there."
      />
      <Card className="mb-4">
        <CardHeader>
          <div>
            <CardTitle>Find student or token</CardTitle>
            <CardDescription>Enter a student ID, phone number, or token code to open their payment form.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <TokenSearch
            action={`${basePath}/new`}
            defaultValue={find}
            error={results?.rows.length && findError?.startsWith("No token or student") ? undefined : findError}
          />
        </CardContent>
      </Card>

      {results && results.rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Matching students</CardTitle>
            <CardDescription>Select a student to open their newest token.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-line-2">
              {results.rows.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`${basePath}/new?find=${encodeURIComponent(s.studentCode)}`}
                    className="hover:bg-surface-2 transition-colors flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <span>
                      <span className="font-semibold text-ink">{s.fullName}</span>{" "}
                      <span className="text-muted-foreground text-xs font-mono">
                        ID {s.studentCode} · {s.phone}
                      </span>
                    </span>
                    <span className="text-muted-foreground text-xs font-medium">
                      {s.buildingCode} {s.roomNumber ? `· ${s.roomNumber}-${s.seatLabel}` : ""}
                      {s.status === "left" && " · Left"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
