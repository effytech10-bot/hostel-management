import { Download } from "lucide-react";
import Link from "next/link";
import { CHART, Columns, compact, RowBars, shortDate, shortMonth, type Column } from "@/components/charts/charts";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { KpiTile } from "@/components/ui/kpi";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsNav } from "@/components/ui/tabs-nav";
import { dhakaDate, formatPeriod } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import { parseReportParams, reportQuery, type ReportName, type ReportParams } from "@/lib/report-params";
import { METHOD_LABEL } from "@/lib/validation/payments";
import type { SessionUser } from "@/server/auth/session";
import { HEAD_LABEL, type LedgerHead } from "@/server/domain/billing";
import { listBuildings } from "@/server/services/buildings";
import {
  balanceReport,
  BILLED_HEADS,
  collectionSummary,
  mealSettlementReport,
  monthReport,
} from "@/server/services/reports";
import { listBatches } from "@/server/services/students";
import { AuditReport } from "./audit-report";

type SP = Record<string, string | string[] | undefined>;

const TABS: { r: ReportName; label: string; adminOnly?: boolean }[] = [
  { r: "dues", label: "Dues & advance" },
  { r: "collections", label: "Collections" },
  { r: "meals", label: "Meal settlement" },
  { r: "month", label: "Month summary" },
  { r: "audit", label: "কে কী করেছে (Audit log)", adminOnly: true },
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

      <TabsNav
        items={tabs.map((t) => ({
          key: t.r,
          label: t.label,
          href: `${base}${reportQuery({ r: t.r })}`,
          active: t.r === r,
        }))}
        className="mb-6"
      />

      {r === "dues" && <DuesReport actor={actor} area={area} p={params} buildings={buildingList} />}
      {r === "collections" && <CollectionsReport actor={actor} area={area} p={params} buildings={buildingList} />}
      {r === "meals" && <MealsReport actor={actor} area={area} p={params} buildings={buildingList} />}
      {r === "month" && <MonthReport actor={actor} area={area} p={params} />}
      {r === "audit" && actor.role === "admin" && <AuditReport actor={actor} area={area} p={params} />}
    </>
  );
}

type Props = { actor: SessionUser; area: string; p: ReportParams; buildings?: { id: string; code: string }[] };

function CsvButton({ p, extra }: { p: ReportParams; extra: Record<string, string | undefined> }) {
  return (
    <Button asChild variant="outline" size="sm" className="gap-1.5">
      <a href={`/api/reports/csv${reportQuery({ r: p.r, ...extra })}`}>
        <Download className="size-3.5" />
        <span>Excel (CSV)</span>
      </a>
    </Button>
  );
}

function BuildingSelect({ buildings, value }: { buildings: { id: string; code: string }[]; value?: string }) {
  if (buildings.length <= 1) return null;
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="building" className="text-ink-2 text-[12.5px] font-semibold">
        Building
      </Label>
      <Select id="building" name="building" defaultValue={value ?? ""} className="h-9 w-auto text-[13.5px]">
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
      <Button type="submit" variant="outline" size="sm" className="h-9">
        Show
      </Button>
    </form>
  );
}

const money = (paisa: number) => formatTaka(paisa);

function Signed({ paisa }: { paisa: number }) {
  if (paisa === 0) return <span className="text-muted">—</span>;
  return (
    <span className={paisa > 0 ? "text-bad font-semibold" : "text-ok font-semibold"}>
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
        <div className="flex flex-col gap-1">
          <Label htmlFor="status" className="text-ink-2 text-[12.5px] font-semibold">
            Students
          </Label>
          <Select id="status" name="status" defaultValue={p.status} className="h-9 w-auto text-[13.5px]">
            <option value="active">Current</option>
            <option value="left">Former (left)</option>
            <option value="all">All</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="batch" className="text-ink-2 text-[12.5px] font-semibold">
            Batch
          </Label>
          <Select id="batch" name="batch" defaultValue={p.batch ?? ""} className="h-9 w-auto text-[13.5px]">
            <option value="">All batches</option>
            {batchList.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="show" className="text-ink-2 text-[12.5px] font-semibold">
            Show
          </Label>
          <Select id="show" name="show" defaultValue={p.show} className="h-9 w-auto text-[13.5px]">
            <option value="due">Who owes money</option>
            <option value="credit">Who has credit</option>
            <option value="all">Everyone</option>
          </Select>
        </div>
      </FilterBar>

      <div className="mb-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-4">
        <KpiTile label={`Total due (${t.withDue} ${who})`} value={money(t.duePaisa)} tone="red" />
        <KpiTile
          label={`Credit to students (${t.withCredit})`}
          value={money(t.creditPaisa)}
          tone="green"
          note="Hostel owes this back or it goes to next bill"
        />
        <KpiTile label="Net" value={money(t.duePaisa - t.creditPaisa)} />
        <KpiTile
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
                  <TableRow
                    key={b.buildingCode}
                    className={b.buildingCode === "All buildings" ? "bg-surface-2 font-bold" : ""}
                  >
                    <TableCell>{b.buildingCode}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.students}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.withDue}</TableCell>
                    <TableCell className="text-bad text-right font-semibold tabular-nums">
                      {money(b.duePaisa)}
                    </TableCell>
                    <TableCell className="text-ok text-right font-semibold tabular-nums">
                      {money(b.creditPaisa)}
                    </TableCell>
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
            <p className="text-muted py-4 text-sm">Nobody here.</p>
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
                          className="text-brand font-medium hover:underline"
                        >
                          {row.fullName}
                        </Link>
                        <div className="text-muted text-xs">
                          ID <span className="font-mono">{row.studentCode}</span>
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
          <p className="text-muted py-4 text-sm">Nothing.</p>
        ) : (
          <Table>
            <TableBody>
              {rows.map((x) => (
                <TableRow key={x.key}>
                  <TableCell>{x.label}</TableCell>
                  <TableCell className="text-muted text-right tabular-nums">{x.count}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{money(x.totalPaisa)}</TableCell>
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
        <div className="flex flex-col gap-1">
          <Label htmlFor="from" className="text-ink-2 text-[12.5px] font-semibold">
            From
          </Label>
          <Input id="from" type="date" name="from" defaultValue={p.from} className="h-9 w-auto text-[13.5px]" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="to" className="text-ink-2 text-[12.5px] font-semibold">
            To
          </Label>
          <Input id="to" type="date" name="to" defaultValue={p.to} className="h-9 w-auto text-[13.5px]" />
        </div>
        <BuildingSelect buildings={buildings} value={p.building} />
      </FilterBar>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="grid flex-1 grid-cols-1 gap-3.5 sm:grid-cols-2 md:max-w-lg">
          <KpiTile
            label={`Collected ${p.from === p.to ? `on ${p.from}` : `${p.from} → ${p.to}`}`}
            value={money(data.totalPaisa)}
          />
          <KpiTile label="Receipts" value={String(data.count)} note="Voided receipts are not counted" />
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

      {data.count > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <div>
              <CardTitle>Collected over time</CardTitle>
              <CardDescription>Point at a column to see the amount and the number of receipts.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Columns
              label="Money collected over time"
              series={[{ label: "Collected", color: CHART.in }]}
              tick={compact}
              cols={collectionColumns(p.from, p.to, data.byDay)}
            />
          </CardContent>
        </Card>
      )}

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
        <div className="flex flex-col gap-1">
          <Label htmlFor="month" className="text-ink-2 text-[12.5px] font-semibold">
            Month
          </Label>
          <Input id="month" type="month" name="month" defaultValue={p.month} className="h-9 w-auto text-[13.5px]" />
        </div>
        <BuildingSelect buildings={buildings} value={p.building} />
      </FilterBar>

      {data.rows.length === 0 ? (
        <Card>
          <CardContent className="text-muted py-6 text-sm">
            No meal settlement for {formatPeriod(p.month)} yet. It is made when the next tokens are made (Tokens) or
            when a student leaves.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-5">
            <KpiTile label="Meal cost" value={money(t.costPaisa)} note={`${t.students} students`} />
            <KpiTile label="Meal deposit taken" value={money(t.depositPaisa)} />
            <KpiTile label="Students must pay more" value={money(t.studentsOwePaisa)} tone="red" />
            <KpiTile label="Students get back" value={money(t.hostelOwesPaisa)} tone="green" />
            <KpiTile
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
                          className="text-brand font-medium hover:underline"
                        >
                          {r.fullName}
                        </Link>
                        <div className="text-muted text-xs">
                          ID <span className="font-mono">{r.studentCode}</span>
                          {r.status === "left" && " · left"}
                        </div>
                      </TableCell>
                      <TableCell>{r.buildingCode}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.breakfast} / {r.lunch} / {r.dinner}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.costPaisa)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.depositPaisa)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {r.differencePaisa > 0 ? (
                          <span className="text-bad">pays {money(r.differencePaisa)}</span>
                        ) : r.differencePaisa < 0 ? (
                          <span className="text-ok">gets {money(-r.differencePaisa)}</span>
                        ) : (
                          <span className="text-muted">even</span>
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
        <div className="flex flex-col gap-1">
          <Label htmlFor="month" className="text-ink-2 text-[12.5px] font-semibold">
            Month
          </Label>
          <Input id="month" type="month" name="month" defaultValue={p.month} className="h-9 w-auto text-[13.5px]" />
        </div>
      </FilterBar>
      {rows.some((r) => r.billedTotalPaisa > 0 || r.collectedPaisa > 0) && (
        <Card className="mb-6">
          <CardHeader>
            <div>
              <CardTitle>Billed and collected, by building</CardTitle>
              <CardDescription>
                {total
                  ? `${formatPeriod(p.month)}: billed ${money(total.billedTotalPaisa)}, collected ${money(total.collectedPaisa)}. Collected can include old dues paid this month.`
                  : `${formatPeriod(p.month)}. Collected can include old dues paid this month.`}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <RowBars
              format={money}
              series={[
                { label: "Billed this month", color: CHART.owed },
                { label: "Collected this month", color: CHART.in },
              ]}
              rows={rows.map((r) => ({
                key: r.buildingCode,
                label: r.buildingCode,
                values: [r.billedTotalPaisa, r.collectedPaisa],
              }))}
            />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>{formatPeriod(p.month)} by building</CardTitle>
            <CardDescription>
              Billed = this month&apos;s tokens and admission bills. Collected = money received during the month.
            </CardDescription>
          </div>
          <CsvButton p={p} extra={{ month: p.month }} />
        </CardHeader>
        <CardContent>
          {all.length === 0 ? (
            <p className="text-muted py-4 text-sm">No buildings.</p>
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
                  <TableRow key={r.buildingCode} className={r === total ? "bg-surface-2 font-bold" : ""}>
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
                    <TableCell className="text-right font-semibold tabular-nums">{money(r.billedTotalPaisa)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{money(r.collectedPaisa)}</TableCell>
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

/** Columns for the collections chart: one per day up to two months, otherwise one per month. */
function collectionColumns(
  from: string,
  to: string,
  byDay: { date: string; totalPaisa: number; count: number }[],
): Column[] {
  const map = new Map(byDay.map((d) => [d.date, d]));
  const dates: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
    if (dates.length > 3700) break;
  }
  const today = dhakaDate();
  if (dates.length <= 62) {
    return dates.map((date, i) => {
      const d = map.get(date);
      const day = Number(date.slice(8, 10));
      const first = i === 0 || day === 1;
      const tick =
        dates.length <= 10 || first
          ? shortDate(date)
          : day % 5 === 0 || i === dates.length - 1
            ? String(day)
            : undefined;
      return {
        key: date,
        tick,
        mark: date === today,
        future: date > today,
        title: `${shortDate(date)}: ${money(d?.totalPaisa ?? 0)} · ${d?.count ?? 0} receipt(s)`,
        values: [d?.totalPaisa ?? 0],
      };
    });
  }
  const months = new Map<string, { totalPaisa: number; count: number }>();
  for (const date of dates) {
    const m = date.slice(0, 7);
    const cur = months.get(m) ?? { totalPaisa: 0, count: 0 };
    const d = map.get(date);
    if (d) {
      cur.totalPaisa += d.totalPaisa;
      cur.count += d.count;
    }
    months.set(m, cur);
  }
  return [...months].map(([m, v]) => ({
    key: m,
    tick: shortMonth(m),
    title: `${formatPeriod(m)}: ${money(v.totalPaisa)} · ${v.count} receipt(s)`,
    values: [v.totalPaisa],
  }));
}
