import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTaka } from "@/lib/money";
import type { SessionUser } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { listBuildings } from "@/server/services/buildings";
import {
  getStudentDetail,
  listAvailableSeats,
  listBatches,
  listStudents,
  type StudentFilters,
} from "@/server/services/students";
import { AccountSummary, PaymentHistory } from "@/components/payments/account-summary";
import { AdjustmentForm } from "@/components/payments/adjustment-form";
import { getStudentMoney, listPaymentAccounts } from "@/server/services/payments";
import { LeaveForm, RefundForm } from "./leave-forms";
import { listStudentTokens } from "@/server/services/tokens";
import { TokenStatusBadge } from "@/components/tokens/token-status";
import { formatPeriod } from "@/lib/dates";
import { AdmissionForm } from "./admission-form";
import type { SeatOption } from "./seat-picker";
import { EditProfileForm, ResetStudentPasswordForm, TransferForm } from "./student-forms";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function StudentsListPage({
  actor,
  basePath,
  searchParams,
}: {
  actor: SessionUser;
  basePath: string;
  searchParams: SearchParams;
}) {
  const statusParam = one(searchParams.status);
  const filters: StudentFilters = {
    q: one(searchParams.q),
    buildingId: UUID_RE.test(one(searchParams.building) ?? "") ? one(searchParams.building) : undefined,
    batchId: UUID_RE.test(one(searchParams.batch) ?? "") ? one(searchParams.batch) : undefined,
    status: statusParam === "left" || statusParam === "all" ? statusParam : "active",
    page: Number(one(searchParams.page)) || 1,
  };

  const [result, buildingList, batchList] = await Promise.all([
    listStudents(actor, filters),
    listBuildings(actor),
    listBatches(actor),
  ]);

  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.buildingId) params.set("building", filters.buildingId);
    if (filters.batchId) params.set("batch", filters.batchId);
    if (filters.status !== "active") params.set("status", filters.status!);
    params.set("page", String(page));
    return `${basePath}?${params}`;
  };

  return (
    <>
      <PageHeader title="Students" description={`${result.total} student(s)`}>
        <Button asChild>
          <Link href={`${basePath}/new`}>+ Admit student</Link>
        </Button>
      </PageHeader>

      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <Input name="q" defaultValue={filters.q} placeholder="Search name, Student ID, phone or room" />
        <Select name="building" defaultValue={filters.buildingId ?? ""}>
          <option value="">All buildings</option>
          {buildingList.map((b) => (
            <option key={b.id} value={b.id}>
              {b.code}
            </option>
          ))}
        </Select>
        <Select name="batch" defaultValue={filters.batchId ?? ""}>
          <option value="">All batches</option>
          {batchList.map((b) => (
            <option key={b.id} value={b.id}>
              Batch {b.name}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={filters.status}>
          <option value="active">Active</option>
          <option value="left">Former (left)</option>
          <option value="all">All</option>
        </Select>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      <Card className="py-0">
        <CardContent className="px-0">
          {result.rows.length === 0 ? (
            <p className="text-muted-foreground p-6 text-sm">No students found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Building</TableHead>
                  <TableHead>Seat</TableHead>
                  <TableHead className="text-right">Rent</TableHead>
                  <TableHead>Batch</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="tabular-nums">{s.studentCode}</TableCell>
                    <TableCell>
                      <Link href={`${basePath}/${s.id}`} className="text-primary font-medium hover:underline">
                        {s.fullName}
                      </Link>
                      {s.status === "left" && (
                        <Badge variant="secondary" className="ml-2">
                          Left
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{s.phone}</TableCell>
                    <TableCell>{s.buildingCode ?? "—"}</TableCell>
                    <TableCell>{s.roomNumber ? `${s.roomNumber}-${s.seatLabel}` : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.rentPaisa != null ? formatTaka(s.rentPaisa) : "—"}
                    </TableCell>
                    <TableCell>{s.batchName ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {result.pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {result.page} of {result.pageCount}
          </span>
          <div className="flex gap-2">
            {result.page > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href={pageHref(result.page - 1)}>← Previous</Link>
              </Button>
            )}
            {result.page < result.pageCount && (
              <Button asChild variant="outline" size="sm">
                <Link href={pageHref(result.page + 1)}>Next →</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Admission
// ---------------------------------------------------------------------------

export async function NewStudentPage({ actor, basePath }: { actor: SessionUser; basePath: string }) {
  const [seats, batchList] = await Promise.all([listAvailableSeats(actor), listBatches(actor)]);
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={basePath} className="text-muted-foreground hover:underline">
          ← Students
        </Link>
      </p>
      <PageHeader
        title="Admit a student"
        description="Creates the student's profile, login and seat. Fees (advance, first month) come with the billing module."
      />
      <Card>
        <CardContent>
          <AdmissionForm seats={seats} batches={batchList.map((b) => b.name)} basePath={basePath} />
        </CardContent>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{value || "—"}</dd>
    </div>
  );
}

export async function StudentDetailPage({
  actor,
  basePath,
  studentId,
}: {
  actor: SessionUser;
  basePath: string;
  studentId: string;
}) {
  if (!UUID_RE.test(studentId)) notFound();
  let detail;
  try {
    detail = await getStudentDetail(actor, studentId);
  } catch (e) {
    if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
  const { student, current, history, batchName, photoUrl } = detail;

  const [freeSeats, batchList, money] = await Promise.all([
    listAvailableSeats(actor),
    listBatches(actor),
    getStudentMoney(actor, student.id),
  ]);
  const [studentTokens, accounts] = await Promise.all([
    listStudentTokens(actor, student.id),
    actor.role === "admin" ? listPaymentAccounts(actor) : Promise.resolve([]),
  ]);
  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));
  const paymentsPath = basePath.replace("/students", "/payments");
  const seatOptions: SeatOption[] = current
    ? [
        {
          seatId: current.seatId,
          label: current.seatLabel,
          isReserved: false,
          reservedNote: null,
          roomId: current.roomId,
          roomNumber: current.roomNumber,
          defaultRentPaisa: current.rentPaisa,
          buildingId: current.buildingId,
          buildingCode: current.buildingCode,
          isCurrent: true,
        },
        ...freeSeats,
      ]
    : freeSeats;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={basePath} className="text-muted-foreground hover:underline">
          ← Students
        </Link>
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="bg-muted size-20 overflow-hidden rounded-xl border">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={student.fullName} className="size-full object-cover" />
          ) : (
            <div className="text-muted-foreground flex size-full items-center justify-center text-2xl font-semibold">
              {student.fullName.slice(0, 1)}
            </div>
          )}
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{student.fullName}</h1>
          <p className="text-muted-foreground text-sm">
            ID <span className="text-foreground font-medium tabular-nums">{student.studentCode}</span> · {student.phone}
            {batchName && <> · Batch {batchName}</>}
          </p>
          <div className="mt-1 flex gap-2">
            <Badge variant={student.status === "active" ? "success" : "secondary"}>
              {student.status === "active" ? "Active" : `Left on ${student.leftDate}`}
            </Badge>
            {current && (
              <Badge variant="outline">
                {current.buildingCode} · {current.roomNumber}-{current.seatLabel} · {formatTaka(current.rentPaisa)}
                /month
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Account</CardTitle>
            <Button asChild size="sm">
              <Link href={`${paymentsPath}/new?student=${student.id}`}>Take payment</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <AccountSummary
              balances={money.balances}
              dues={money.dues}
              totalPaisa={money.totalPaisa}
              advanceHeldPaisa={money.advanceHeldPaisa}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentHistory payments={money.payments} refunds={money.refunds} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Monthly tokens</CardTitle>
          </CardHeader>
          <CardContent>
            {studentTokens.length === 0 ? (
              <p className="text-muted-foreground text-sm">No tokens yet. They are made at month-end.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {studentTokens.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/print/tokens?token=${t.id}`}
                      target="_blank"
                      className="hover:bg-muted inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                    >
                      {formatPeriod(t.period)}
                      <span className="font-medium tabular-nums">{formatTaka(t.totalPaisa)}</span>
                      <TokenStatusBadge status={t.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {actor.role === "admin" && money.totalPaisa < 0 && accountOptions.length > 0 && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Pay money back (admin)</CardTitle>
              <CardDescription>
                The hostel owes this student {formatTaka(-money.totalPaisa)}. Record it here when it is paid.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RefundForm studentId={student.id} maxPaisa={-money.totalPaisa} accounts={accountOptions} />
            </CardContent>
          </Card>
        )}

        {actor.role === "admin" && student.status === "active" && current && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Student leaving (admin)</CardTitle>
              <CardDescription>
                Settles this month&apos;s meals, gives back unused days (if the rule in Settings is “by days”), returns
                the paid advance against dues, frees the seat and stops future tokens. Preview first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LeaveForm studentId={student.id} accounts={accountOptions} />
            </CardContent>
          </Card>
        )}

        {actor.role === "admin" && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Adjust account (admin)</CardTitle>
              <CardDescription>
                Opening balance from the old Excel, an extra charge, or a discount / waiver. Every change is kept in the
                history and cannot be deleted; to undo, add the opposite adjustment.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AdjustmentForm studentId={student.id} />
            </CardContent>
          </Card>
        )}

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Info label="Father / guardian" value={student.fatherName} />
              <Info label="Guardian phone" value={student.guardianPhone} />
              <Info label="Admission date" value={student.admissionDate} />
              <Info label="School" value={student.school} />
              <Info label="College" value={student.college} />
              <Info
                label="Class / group / roll"
                value={[student.classYear, student.group, student.roll].filter(Boolean).join(" · ")}
              />
              <Info label="Permanent address" value={student.permanentAddress} />
              <Info label="Notes" value={student.notes} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Login</CardTitle>
            <CardDescription>
              Logs in with {student.phone} or ID {student.studentCode}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResetStudentPasswordForm studentId={student.id} />
          </CardContent>
        </Card>

        {student.status === "active" && current && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Change seat or rent</CardTitle>
              <CardDescription>
                Pick a new seat, or keep the current seat and change the rent. History is kept below.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TransferForm
                studentId={student.id}
                seats={seatOptions}
                currentSeatId={current.seatId}
                currentRentPaisa={current.rentPaisa}
              />
            </CardContent>
          </Card>
        )}

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Seat history</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Building</TableHead>
                  <TableHead>Seat</TableHead>
                  <TableHead className="text-right">Rent</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Why it ended</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>{h.buildingCode}</TableCell>
                    <TableCell>
                      {h.roomNumber}-{h.seatLabel}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatTaka(h.rentPaisa)}</TableCell>
                    <TableCell>{h.startDate}</TableCell>
                    <TableCell>{h.endDate ?? <Badge variant="success">Current</Badge>}</TableCell>
                    <TableCell className="text-muted-foreground">{h.endReason?.replace("_", " ") ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Edit profile</CardTitle>
          </CardHeader>
          <CardContent>
            <EditProfileForm
              studentId={student.id}
              photoUrl={photoUrl}
              batches={batchList.map((b) => b.name)}
              defaults={{
                fullName: student.fullName,
                fatherName: student.fatherName,
                phone: student.phone,
                guardianPhone: student.guardianPhone,
                permanentAddress: student.permanentAddress,
                school: student.school,
                college: student.college,
                classYear: student.classYear,
                group: student.group,
                roll: student.roll,
                batchName,
                notes: student.notes,
              }}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
