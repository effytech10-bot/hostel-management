import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <Input type="date" name="from" defaultValue={from} className="w-auto" aria-label="From" />
        <Input type="date" name="to" defaultValue={to} className="w-auto" aria-label="To" />
        <Select name="building" defaultValue={buildingId ?? ""} className="w-auto min-w-36">
          <option value="">All buildings</option>
          {buildingList.map((b) => (
            <option key={b.id} value={b.id}>
              {b.code}
            </option>
          ))}
        </Select>
        <Select name="account" defaultValue={accountId ?? ""} className="w-auto min-w-44">
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="outline">
          Show
        </Button>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="gap-1 py-4">
          <CardHeader className="px-4">
            <CardDescription>Total collected ({totals.count})</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatTaka(totals.totalPaisa)}</CardTitle>
          </CardHeader>
        </Card>
        {totals.byAccount.map((a) => (
          <Card key={a.accountName} className="gap-1 py-4">
            <CardHeader className="px-4">
              <CardDescription className="truncate">
                {a.accountName} ({a.count})
              </CardDescription>
              <CardTitle className="text-2xl tabular-nums">{formatTaka(a.totalPaisa)}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
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
                        className="text-primary font-medium hover:underline"
                      >
                        {r.receiptNo}
                      </Link>
                      {r.voidedAt && (
                        <Badge variant="destructive" className="ml-2">
                          Void
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{r.paidDate}</TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {r.tokenCode ? (
                        <Link
                          href={`${basePath.replace("/payments", "/tokens")}/${r.tokenCode}`}
                          className="text-primary hover:underline"
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
                        className="hover:underline"
                      >
                        {r.studentName}
                      </Link>{" "}
                      <span className="text-muted-foreground text-xs">{r.studentCode}</span>
                    </TableCell>
                    <TableCell>{r.buildingCode ?? "—"}</TableCell>
                    <TableCell>{r.accountName}</TableCell>
                    <TableCell className="font-mono text-xs">{r.trxId ?? ""}</TableCell>
                    <TableCell className="text-muted-foreground">{r.receivedByName ?? ""}</TableCell>
                    <TableCell
                      className={r.voidedAt ? "text-right tabular-nums line-through" : "text-right tabular-nums"}
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
      <div className="mb-4">
        <TokenSearch
          action={`${basePath}/new`}
          defaultValue={find}
          error={results?.rows.length && findError?.startsWith("No token or student") ? undefined : findError}
        />
      </div>
      {results && results.rows.length > 0 && (
        <Card className="py-0">
          <CardContent className="px-0">
            <ul className="divide-y">
              {results.rows.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`${basePath}/new?find=${encodeURIComponent(s.studentCode)}`}
                    className="hover:bg-muted/50 flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <span>
                      <span className="font-medium">{s.fullName}</span>{" "}
                      <span className="text-muted-foreground text-sm">
                        ID {s.studentCode} · {s.phone}
                      </span>
                    </span>
                    <span className="text-muted-foreground text-sm">
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
