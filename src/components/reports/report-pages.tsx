import { Download } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPeriod } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import { parseReportParams, reportQuery, type ReportName, type ReportParams } from "@/lib/report-params";
import { cn } from "@/lib/utils";
import { METHOD_LABEL } from "@/lib/validation/payments";
import type { SessionUser } from "@/server/auth/session";
import { HEAD_LABEL, type LedgerHead } from "@/server/domain/billing";
import { listBuildings } from "@/server/services/buildings";
import {
  auditActionGroups,
  balanceReport,
  BILLED_HEADS,
  collectionSummary,
  listAuditLog,
  mealSettlementReport,
  monthReport,
} from "@/server/services/reports";
import { listBatches } from "@/server/services/students";

type SP = Record<string, string | string[] | undefined>;

const TABS: { r: ReportName; label: string; adminOnly?: boolean }[] = [
  { r: "dues", label: "Dues & advance" },
  { r: "collections", label: "Collections" },
  { r: "meals", label: "Meal settlement" },
  { r: "month", label: "Month summary" },
  { r: "audit", label: "Audit log", adminOnly: true },
];

/** Reports for admin (/admin/reports) and cashier (/cashier/reports, own buildings only). */
export async function ReportsPage({
  actor,
  area,
  searchParams,
}: {
  actor: SessionUser;
  area: string;
  searchParams: SP;
}) {
  const p = parseReportParams(searchParams);
  const tabs = TABS.filter((t) => !t.adminOnly || actor.role === "admin");
  const r = tabs.some((t) => t.r === p.r) ? p.r : "dues";
  const base = `${area}/reports`;
  const buildingList = await listBuildings(actor);
  const building = buildingList.some((b) => b.id === p.building) ? p.building : undefined;
  const params = { ...p, r, building };

  return (
    <>
      <PageHeader title="Reports" description="All numbers come straight from student accounts and payments." />
      <nav className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Button key={t.r} asChild size="sm" variant={t.r === r ? "default" : "outline"}>
            <Link href={`${base}${reportQuery({ r: t.r })}`}>{t.label}</Link>
          </Button>
        ))}
      </nav>
      {r === "dues" && <DuesReport actor={actor} area={area} p={params} buildings={buildingList} />}
      {r === "collections" && <CollectionsReport actor={actor} area={area} p={params} buildings={buildingList} />}
      {r === "meals" && <MealsReport actor={actor} area={area} p={params} buildings={buildingList} />}
      {r === "month" && <MonthReport actor={actor} area={area} p={params} />}
      {r === "audit" && actor.role === "admin" && <AuditReport actor={actor} area={area} p={params} />}
    </>
  );
}

type Props = { actor: SessionUser; area: string; p: ReportParams; buildings?: { id: string; code: string }[] };

function Stat({ label, value, tone, note }: { label: string; value: string; tone?: "red" | "green"; note?: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={cn(
            "text-2xl tabular-nums",
            tone === "red" && "text-red-700",
            tone === "green" && "text-emerald-700",
          )}
        >
          {value}
        </CardTitle>
        {note && <p className="text-muted-foreground text-xs">{note}</p>}
      </CardHeader>
    </Card>
  );
}

function CsvButton({ p, extra }: { p: ReportParams; extra: Record<string, string | undefined> }) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={`/api/reports/csv${reportQuery({ r: p.r, ...extra })}`}>
        <Download />
        Excel (CSV)
      </a>
    </Button>
  );
}

function BuildingSelect({ buildings, value }: { buildings: { id: string; code: string }[]; value?: string }) {
  if (buildings.length <= 1) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="building">Building</Label>
      <Select id="building" name="building" defaultValue={value ?? ""} className="w-auto">
        <option value="">All buildings</option>
        {buildings.map((b) => (
          <option key={b.id} value={b.id}>
            {b.code}
          </option>
        ))}
      </Select>
    </div>
  );
}

function FilterBar({ r, children }: { r: ReportName; children: React.ReactNode }) {
  return (
    <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
      <input type="hidden" name="r" value={r} />
      {children}
      <Button type="submit" variant="outline">
        Show
      </Button>
    </form>
  );
}

const money = (paisa: number) => formatTaka(paisa);

function Signed({ paisa }: { paisa: number }) {
  if (paisa === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={paisa > 0 ? "text-red-700" : "text-emerald-700"}>
      {paisa > 0 ? money(paisa) : `−${money(-paisa)}`}
    </span>
  );
}

// ---------------------------------------------------------------------------

async function DuesReport({ actor, area, p, buildings = [] }: Props) {
  const [data, batchList] = await Promise.all([
    balanceReport(actor, { buildingId: p.building, status: p.status, batchId: p.batch, show: p.show }),
    listBatches(actor),
  ]);
  const heads: LedgerHead[] = ["rent", "meal", "baburchi", "service_charge", "advance", "other"];
  const t = data.totals;
  const who = p.status === "left" ? "former students" : p.status === "all" ? "students" : "current students";

  return (
    <>
      <FilterBar r="dues">
        <BuildingSelect buildings={buildings} value={p.building} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status">Students</Label>
          <Select id="status" name="status" defaultValue={p.status} className="w-auto">
            <option value="active">Current</option>
            <option value="left">Former (left)</option>
            <option value="all">All</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="batch">Batch</Label>
          <Select id="batch" name="batch" defaultValue={p.batch ?? ""} className="w-auto">
            <option value="">All batches</option>
            {batchList.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="show">Show</Label>
          <Select id="show" name="show" defaultValue={p.show} className="w-auto">
            <option value="due">Who owes money</option>
            <option value="credit">Who has credit</option>
            <option value="all">Everyone</option>
          </Select>
        </div>
      </FilterBar>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label={`Total due (${t.withDue} ${who})`} value={money(t.duePaisa)} tone="red" />
        <Stat
          label={`Credit to students (${t.withCredit})`}
          value={money(t.creditPaisa)}
          tone="green"
          note="Hostel owes this back or it goes to their next bill"
        />
        <Stat label="Net" value={money(t.duePaisa - t.creditPaisa)} />
        <Stat
          label="Student advance held"
          value={money(t.advanceHeldPaisa)}
          note="Not income: belongs to students until they leave"
        />
      </div>

      {data.byBuilding.length > 1 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Building-wise</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Building</TableHead>
                  <TableHead className="text-right">Students</TableHead>
                  <TableHead className="text-right">With due</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Advance held</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...data.byBuilding, { ...t, buildingCode: "All buildings" }].map((b) => (
                  <TableRow key={b.buildingCode} className={b.buildingCode === "All buildings" ? "font-semibold" : ""}>
                    <TableCell>{b.buildingCode}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.students}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.withDue}</TableCell>
                    <TableCell className="text-right text-red-700 tabular-nums">{money(b.duePaisa)}</TableCell>
                    <TableCell className="text-right text-emerald-700 tabular-nums">{money(b.creditPaisa)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(b.advanceHeldPaisa)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Students ({data.rows.length})</CardTitle>
            <CardDescription>Red = the student owes, green minus = the student has credit.</CardDescription>
          </div>
          <CsvButton p={p} extra={{ building: p.building, status: p.status, batch: p.batch, show: p.show }} />
        </CardHeader>
        <CardContent>
          {data.rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nobody here.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Seat</TableHead>
                  {heads.map((h) => (
                    <TableHead key={h} className="text-right">
                      {HEAD_LABEL[h]}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Advance held</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => {
                  const other = (row.balances.other ?? 0) + (row.balances.credit ?? 0);
                  return (
                    <TableRow key={row.studentId}>
                      <TableCell>
                        <Link
                          href={`${area}/students/${row.studentId}`}
                          className="text-primary font-medium hover:underline"
                        >
                          {row.fullName}
                        </Link>
                        <div className="text-muted-foreground text-xs">
                          ID {row.studentCode}
                          {row.status === "left" && ` · left ${row.leftDate}`}
                          {row.batchName && ` · ${row.batchName}`}
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {row.buildingCode}
                        {row.seatText && ` · ${row.seatText}`}
                      </TableCell>
                      {heads.map((h) => (
                        <TableCell key={h} className="text-right tabular-nums">
                          <Signed paisa={h === "other" ? other : (row.balances[h] ?? 0)} />
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-semibold tabular-nums">
                        <Signed paisa={row.totalPaisa} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.advanceHeldPaisa ? money(row.advanceHeldPaisa) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------

async function CollectionsReport({ actor, area, p, buildings = [] }: Props) {
  const data = await collectionSummary(actor, { from: p.from, to: p.to, buildingId: p.building });
  const small = (title: string, rows: { key: string; label: string; totalPaisa: number; count: number }[]) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing.</p>
        ) : (
          <Table>
            <TableBody>
              {rows.map((x) => (
                <TableRow key={x.key}>
                  <TableCell>{x.label}</TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums">{x.count}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{money(x.totalPaisa)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );

  return (
    <>
      <FilterBar r="collections">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from">From</Label>
          <Input id="from" type="date" name="from" defaultValue={p.from} className="w-auto" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to">To</Label>
          <Input id="to" type="date" name="to" defaultValue={p.to} className="w-auto" />
        </div>
        <BuildingSelect buildings={buildings} value={p.building} />
      </FilterBar>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-4 md:max-w-lg">
          <Stat
            label={`Collected ${p.from === p.to ? `on ${p.from}` : `${p.from} → ${p.to}`}`}
            value={money(data.totalPaisa)}
          />
          <Stat label="Receipts" value={String(data.count)} note="Voided receipts are not counted" />
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`${area}/payments${reportQuery({ from: p.from, to: p.to, building: p.building })}`}>
              See every receipt
            </Link>
          </Button>
          <CsvButton p={p} extra={{ from: p.from, to: p.to, building: p.building }} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {small(
          "By day",
          data.byDay.map((d) => ({ key: d.date, label: d.date, totalPaisa: d.totalPaisa, count: d.count })),
        )}
        <div className="flex flex-col gap-6">
          {small(
            "By account (where the money is)",
            data.byAccount.map((a) => ({
              key: a.name,
              label: `${a.name} · ${METHOD_LABEL[a.method as keyof typeof METHOD_LABEL] ?? a.method}`,
              totalPaisa: a.totalPaisa,
              count: a.count,
            })),
          )}
          {small(
            "By building",
            data.byBuilding.map((b) => ({
              key: b.buildingCode,
              label: b.buildingCode,
              totalPaisa: b.totalPaisa,
              count: b.count,
            })),
          )}
          {small(
            "By person who received",
            data.byPerson.map((x) => ({ key: x.name, label: x.name, totalPaisa: x.totalPaisa, count: x.count })),
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

async function MealsReport({ actor, area, p, buildings = [] }: Props) {
  const data = await mealSettlementReport(actor, p.month, p.building);
  const t = data.totals;
  return (
    <>
      <FilterBar r="meals">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="month">Month</Label>
          <Input id="month" type="month" name="month" defaultValue={p.month} className="w-auto" />
        </div>
        <BuildingSelect buildings={buildings} value={p.building} />
      </FilterBar>

      {data.rows.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-6 text-sm">
            No meal settlement for {formatPeriod(p.month)} yet. It is made when the month is closed (Tokens → month-end)
            or when a student leaves.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
            <Stat label="Meal cost" value={money(t.costPaisa)} note={`${t.students} students`} />
            <Stat label="Meal deposit taken" value={money(t.depositPaisa)} />
            <Stat label="Students must pay more" value={money(t.studentsOwePaisa)} tone="red" />
            <Stat label="Students get back" value={money(t.hostelOwesPaisa)} tone="green" />
            <Stat
              label="Net"
              value={`${t.netPaisa < 0 ? "−" : ""}${money(Math.abs(t.netPaisa))}`}
              note={t.netPaisa > 0 ? "Students owe overall" : t.netPaisa < 0 ? "Hostel owes overall" : "Even"}
            />
          </div>
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle>{formatPeriod(p.month)}</CardTitle>
              <CsvButton p={p} extra={{ month: p.month, building: p.building }} />
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Building</TableHead>
                    <TableHead className="text-right">B / L / D</TableHead>
                    <TableHead className="text-right">Meal cost</TableHead>
                    <TableHead className="text-right">Deposit</TableHead>
                    <TableHead className="text-right">Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((r) => (
                    <TableRow key={r.studentId}>
                      <TableCell>
                        <Link
                          href={`${area}/students/${r.studentId}`}
                          className="text-primary font-medium hover:underline"
                        >
                          {r.fullName}
                        </Link>
                        <div className="text-muted-foreground text-xs">
                          ID {r.studentCode}
                          {r.status === "left" && " · left"}
                        </div>
                      </TableCell>
                      <TableCell>{r.buildingCode}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.breakfast} / {r.lunch} / {r.dinner}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.costPaisa)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.depositPaisa)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.differencePaisa > 0 ? (
                          <span className="text-red-700">pays {money(r.differencePaisa)}</span>
                        ) : r.differencePaisa < 0 ? (
                          <span className="text-emerald-700">gets {money(-r.differencePaisa)}</span>
                        ) : (
                          "even"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

async function MonthReport({ actor, p }: Props) {
  const { rows, total } = await monthReport(actor, p.month);
  const all = total && rows.length > 1 ? [...rows, total] : rows;
  return (
    <>
      <FilterBar r="month">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="month">Month</Label>
          <Input id="month" type="month" name="month" defaultValue={p.month} className="w-auto" />
        </div>
      </FilterBar>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>{formatPeriod(p.month)} by building</CardTitle>
            <CardDescription>
              Billed = this month&apos;s tokens and admission bills. Collected = money received during the month (it may
              pay older dues too). Meal cost appears once the month is closed.
            </CardDescription>
          </div>
          <CsvButton p={p} extra={{ month: p.month }} />
        </CardHeader>
        <CardContent>
          {all.length === 0 ? (
            <p className="text-muted-foreground text-sm">No buildings.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Building</TableHead>
                  <TableHead>Tokens</TableHead>
                  {BILLED_HEADS.map((h) => (
                    <TableHead key={h} className="text-right">
                      {HEAD_LABEL[h]}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Total billed</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">Meal cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {all.map((r) => (
                  <TableRow key={r.buildingCode} className={r === total ? "font-semibold" : ""}>
                    <TableCell>{r.buildingCode}</TableCell>
                    <TableCell>
                      {r.tokens === 0 ? (
                        "—"
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          <Badge variant="success">{r.paid} paid</Badge>
                          {r.partial > 0 && <Badge variant="secondary">{r.partial} part</Badge>}
                          {r.unpaid > 0 && <Badge variant="destructive">{r.unpaid} unpaid</Badge>}
                        </span>
                      )}
                    </TableCell>
                    {BILLED_HEADS.map((h) => (
                      <TableCell key={h} className="text-right tabular-nums">
                        {r.billed[h] ? money(r.billed[h]) : "—"}
                      </TableCell>
                    ))}
                    <TableCell className="text-right tabular-nums">{money(r.billedTotalPaisa)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(r.collectedPaisa)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.mealStudents ? `${money(r.mealCostPaisa)} (${r.mealStudents})` : "—"}
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

const TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dhaka",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

async function AuditReport({ actor, area, p }: Props) {
  const [data, groups] = await Promise.all([
    listAuditLog(actor, { action: p.action, page: p.page }),
    auditActionGroups(actor),
  ]);
  const base = `${area}/reports`;
  return (
    <>
      <FilterBar r="audit">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="action">What</Label>
          <Select id="action" name="action" defaultValue={p.action ?? ""} className="w-auto">
            <option value="">Everything</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </div>
      </FilterBar>
      <Card>
        <CardHeader>
          <CardTitle>Who did what</CardTitle>
          <CardDescription>Every change in the software is written here and cannot be edited.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing yet.</p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {data.rows.map((row) => (
                <li key={row.id} className="py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span>
                      <span className="font-medium">{row.action}</span>{" "}
                      <span className="text-muted-foreground">
                        by {row.actorName ?? "system"}
                        {row.actorRole ? ` (${row.actorRole})` : ""}
                      </span>
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">{TIME.format(row.createdAt)}</span>
                  </div>
                  {(row.before !== null || row.after !== null) && (
                    <details className="mt-1">
                      <summary className="text-primary cursor-pointer text-xs select-none">Details</summary>
                      <pre className="bg-muted mt-1 max-h-64 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap">
                        {row.before !== null && `Before: ${JSON.stringify(row.before, null, 2)}\n`}
                        {row.after !== null && `After: ${JSON.stringify(row.after, null, 2)}`}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex gap-2">
            {data.page > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href={`${base}${reportQuery({ r: "audit", action: p.action, page: data.page - 1 })}`}>
                  ← Newer
                </Link>
              </Button>
            )}
            {data.hasMore && (
              <Button asChild variant="outline" size="sm">
                <Link href={`${base}${reportQuery({ r: "audit", action: p.action, page: data.page + 1 })}`}>
                  Older →
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
