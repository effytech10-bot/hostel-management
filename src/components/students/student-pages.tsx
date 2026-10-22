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
import { EarlyTokenCard, LatestTokenCard, TokenHistory } from "@/components/tokens/student-token-cards";
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

      <form method="get" className="mb-4 grid gap-2.5 sm:grid-cols-[1fr_auto_auto_auto_auto] items-end">
        <div className="flex flex-col gap-1">
          <label className="text-[12.5px] font-semibold text-ink-2">Search</label>
          <Input
            name="q"
            defaultValue={filters.q}
            placeholder="Search name, Student ID, phone or room"
            className="h-9 text-[13.5px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[12.5px] font-semibold text-ink-2">Building</label>
          <Select name="building" defaultValue={filters.buildingId ?? ""} className="h-9 text-[13.5px] min-w-32">
            <option value="">All buildings</option>
            {buildingList.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[12.5px] font-semibold text-ink-2">Batch</label>
          <Select name="batch" defaultValue={filters.batchId ?? ""} className="h-9 text-[13.5px] min-w-28">
            <option value="">All batches</option>
            {batchList.map((b) => (
              <option key={b.id} value={b.id}>
                Batch {b.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[12.5px] font-semibold text-ink-2">Status</label>
          <Select name="status" defaultValue={filters.status} className="h-9 text-[13.5px] min-w-28">
            <option value="active">Active</option>
            <option value="left">Former (left)</option>
            <option value="all">All</option>
          </Select>
        </div>
        <Button type="submit" variant="outline" size="sm" className="h-9">
          Search
        </Button>
      </form>

      <Card>
        <CardContent>
          {result.rows.length === 0 ? (
            <p className="text-muted-foreground p-6 text-sm">No students found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Seat</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Rent</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs tabular-nums">{s.studentCode}</TableCell>
                    <TableCell>
                      <Link href={`${basePath}/${s.id}`} className="text-ink font-semibold hover:underline">
                        {s.fullName}
                      </Link>
                      {s.status === "left" && (
                        <Badge variant="secondary" className="ml-2">
                          Left
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.buildingCode ? (
                        <span>
                          <b>{s.buildingCode}</b> · {s.roomNumber ? `${s.roomNumber}-${s.seatLabel}` : "—"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{s.phone}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {s.rentPaisa != null ? formatTaka(s.rentPaisa) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{s.batchName ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Link href={`${basePath}/${s.id}`} className="text-brand font-medium hover:underline text-xs">
                        Open →
                      </Link>
                    </TableCell>
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
        <Link href={basePath} className="text-muted-foreground hover:text-ink hover:underline">
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
  const tokensPath = basePath.replace("/students", "/tokens");
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

  const latestToken = studentTokens[0];

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={basePath} className="text-muted-foreground hover:text-ink hover:underline">
          ← Students
        </Link>
      </p>

      <PageHeader
        title={student.fullName}
        description={`ID ${student.studentCode} · ${student.phone}${current ? ` · ${current.buildingCode} · Room ${current.roomNumber}-${current.seatLabel}` : ""}${batchName ? ` · Batch ${batchName}` : ""}`}
      >
        {latestToken?.code && actor.role !== "student" && (
          <Button asChild>
            <Link href={`${tokensPath}/${latestToken.code}`}>Take payment</Link>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link href={basePath}>← All students</Link>
        </Button>
      </PageHeader>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="bg-surface-2 border-line size-16 shrink-0 overflow-hidden rounded-[12px] border shadow-card flex items-center justify-center">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={student.fullName} className="size-full object-cover" />
          ) : (
            <div className="bg-student grid size-full place-items-center text-xl font-bold text-white select-none">
              {student.fullName.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-ink text-xl font-bold">{student.fullName}</h2>
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
          <p className="text-muted-foreground mt-0.5 text-xs font-mono">
            ID {student.studentCode} · {student.phone}
            {student.admissionDate && ` · Admitted ${student.admissionDate}`}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column: Account, Balance & Tokens */}
        <div className="flex flex-col gap-6">
          <LatestTokenCard tokens={studentTokens} tokensPath={tokensPath} canPay={actor.role !== "student"} />

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Account balance</CardTitle>
                <CardDescription>
                  What the student owes or has extra, by type. The newest token shows the same.
                </CardDescription>
              </div>
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
              <CardTitle>Bills (tokens)</CardTitle>
              <CardDescription>Every monthly token and admission bill.</CardDescription>
            </CardHeader>
            <CardContent>
              <TokenHistory tokens={studentTokens} tokensPath={tokensPath} />
            </CardContent>
          </Card>

          {actor.role === "admin" && student.status === "active" && current && (
            <EarlyTokenCard actor={actor} studentId={student.id} tokensPath={tokensPath} />
          )}

          {actor.role === "admin" && money.totalPaisa < 0 && accountOptions.length > 0 && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Pay money back (admin)</CardTitle>
                  <CardDescription>
                    The hostel owes this student {formatTaka(-money.totalPaisa)}. Record it here when it is paid.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <RefundForm studentId={student.id} maxPaisa={-money.totalPaisa} accounts={accountOptions} />
              </CardContent>
            </Card>
          )}

          {actor.role === "admin" && student.status === "active" && current && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Student leaving (admin)</CardTitle>
                  <CardDescription>
                    Settles meals, returns advance against dues, and frees the seat.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <LeaveForm studentId={student.id} accounts={accountOptions} />
              </CardContent>
            </Card>
          )}

          {actor.role === "admin" && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Adjust account (admin)</CardTitle>
                  <CardDescription>
                    Opening balance from old records, an extra charge, or a waiver.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <AdjustmentForm studentId={student.id} />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Profile, Payments, Login & Seat Changes */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="kv">
                <dt>Phone (login)</dt>
                <dd className="font-mono">{student.phone}</dd>
                <dt>Father / guardian</dt>
                <dd>{student.fatherName || "—"}</dd>
                <dt>Guardian phone</dt>
                <dd className="font-mono">{student.guardianPhone || "—"}</dd>
                <dt>School</dt>
                <dd>{student.school || "—"}</dd>
                <dt>College</dt>
                <dd>{student.college || "—"}</dd>
                <dt>Class / group / roll</dt>
                <dd>{[student.classYear, student.group, student.roll].filter(Boolean).join(" · ") || "—"}</dd>
                <dt>Batch</dt>
                <dd>{batchName || "—"}</dd>
                <dt>Admission date</dt>
                <dd>{student.admissionDate || "—"}</dd>
                <dt>Permanent address</dt>
                <dd>{student.permanentAddress || "—"}</dd>
                {student.notes && (
                  <>
                    <dt>Notes</dt>
                    <dd>{student.notes}</dd>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payments & receipts</CardTitle>
              <CardDescription>Every payment recorded for this student.</CardDescription>
            </CardHeader>
            <CardContent>
              <PaymentHistory payments={money.payments} refunds={money.refunds} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Login password</CardTitle>
                <CardDescription>
                  Logs in with phone {student.phone} or ID {student.studentCode}.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ResetStudentPasswordForm studentId={student.id} />
            </CardContent>
          </Card>

          {student.status === "active" && current && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Change seat or rent</CardTitle>
                  <CardDescription>
                    Pick a new seat, or keep the current seat and change the rent.
                  </CardDescription>
                </div>
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

          <Card>
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
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="font-semibold">{h.buildingCode}</TableCell>
                      <TableCell>
                        {h.roomNumber}-{h.seatLabel}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{formatTaka(h.rentPaisa)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{h.startDate}</TableCell>
                      <TableCell className="text-xs">{h.endDate ?? <Badge variant="success">Current</Badge>}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{h.endReason?.replace("_", " ") ?? ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
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
      </div>
    </>
  );
}
