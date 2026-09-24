"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatPeriod } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ImportRowResult } from "@/server/services/student-import";
import { importChunkAction, previewImportAction, type PreviewState } from "./actions";

const CHUNK = 10;

function downloadLoginList(results: ImportRowResult[]) {
  const rows = [
    ["Student ID", "Name", "Phone (login)", "Seat", "First password"],
    ...results
      .filter((r) => r.ok)
      .map((r) => [r.studentCode ?? "", r.name, r.phone, r.seatText ?? "", r.phone.slice(-6)]),
  ];
  const csv =
    "﻿" + rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "student-logins.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportWizard({ months }: { months: string[] }) {
  const [preview, previewAction, previewing] = useActionState<PreviewState, FormData>(previewImportAction, {});
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<ImportRowResult[] | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const plan = preview.plan;
  const ready = plan?.rows.filter((r) => r.status === "ready" && r.send) ?? [];

  async function runImport() {
    if (!plan) return;
    setRunning(true);
    setRunError(null);
    setResults([]);
    setDone(0);
    const all: ImportRowResult[] = [];
    for (let i = 0; i < ready.length; i += CHUNK) {
      const chunk = ready.slice(i, i + CHUNK).map((r) => ({ rowNo: r.rowNo, raw: r.send! }));
      const res = await importChunkAction({ start: plan.startPeriod, rows: chunk });
      if (res.error || !res.results) {
        setRunError(`${res.error ?? "Stopped."} ${all.filter((r) => r.ok).length} students were saved before this.`);
        break;
      }
      all.push(...res.results);
      setResults([...all]);
      setDone(Math.min(ready.length, i + CHUNK));
    }
    setRunning(false);
    setConfirming(false);
  }

  // Step 3: results
  if (results && !running) {
    const ok = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok && !r.skipped);
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {ok.length} student(s) imported{failed.length ? `, ${failed.length} failed` : ""}
          </CardTitle>
          <CardDescription>
            Each student logs in with their phone number. First password = last 6 digits of the phone; they must set
            their own at the first login.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FormMessage error={runError ?? undefined} />
          <div className="flex flex-wrap gap-2">
            {ok.length > 0 && <Button onClick={() => downloadLoginList(results)}>Download login list (CSV)</Button>}
            <Button asChild variant="outline">
              <Link href="/admin/students">Students</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/go-live">Go-live checklist</Link>
            </Button>
            <Button variant="ghost" onClick={() => window.location.reload()}>
              Import another file
            </Button>
          </div>
          {failed.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {failed.map((r) => (
                <li key={r.rowNo} className="text-red-700">
                  Row {r.rowNo} · {r.name}: {r.message}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Upload the filled Excel file</CardTitle>
          <CardDescription>Nothing is saved at this step. You will see a check of every row first.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={previewAction} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="file">Excel file (.xlsx) or .csv</Label>
              <Input id="file" name="file" type="file" accept=".xlsx,.csv" required className="w-auto" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="start">Software starts from</Label>
              <Select id="start" name="start" defaultValue={months[1] ?? months[0]} className="w-auto">
                {months.map((m) => (
                  <option key={m} value={m}>
                    1 {formatPeriod(m)}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" disabled={previewing || running}>
              {previewing ? "Checking…" : "Check the file"}
            </Button>
          </form>
          <FormMessage error={preview.error} className="mt-3" />
        </CardContent>
      </Card>

      {plan && (
        <Card>
          <CardHeader>
            <CardTitle>2. Check and import</CardTitle>
            <CardDescription>
              Sheet &quot;{preview.sheetName}&quot;. Seats (rent and meals) start on {plan.startDate}. Dues in the file
              are saved as the opening balance for {formatPeriod(plan.openingPeriod)} and appear as &quot;previous
              due&quot; on the first token.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <Box label="Ready to import" value={String(plan.summary.ready)} tone="green" />
              <Box label="Already in software (skipped)" value={String(plan.summary.skip)} />
              <Box
                label="Rows with problems"
                value={String(plan.summary.error)}
                tone={plan.summary.error ? "red" : undefined}
              />
              <Box
                label="Will be created"
                value={`${plan.summary.newBuildings.length} bldg · ${plan.summary.newRooms} rooms · ${plan.summary.newSeats} seats`}
              />
              <Box label="Opening dues" value={formatTaka(plan.summary.openingDuePaisa)} tone="red" />
              <Box label="Opening credit" value={formatTaka(plan.summary.openingCreditPaisa)} />
              <Box label="Advance held" value={formatTaka(plan.summary.advanceHeldPaisa)} />
            </div>
            {plan.summary.newBuildings.length > 0 && (
              <p className="text-sm">
                New buildings: <span className="font-medium">{plan.summary.newBuildings.join(", ")}</span>. If one of
                these is a spelling of an existing building, fix the file and check again.
              </p>
            )}
            {plan.summary.error > 0 && (
              <p className="text-sm text-red-700">
                Rows with problems are NOT imported. Fix them in Excel and upload the file again later (students already
                imported are skipped automatically).
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {!confirming ? (
                <Button onClick={() => setConfirming(true)} disabled={ready.length === 0 || running}>
                  Import {ready.length} student(s)
                </Button>
              ) : (
                <>
                  <Button onClick={runImport} disabled={running}>
                    {running ? `Importing… ${done} / ${ready.length}` : `Yes, import ${ready.length} student(s)`}
                  </Button>
                  {!running && (
                    <Button variant="ghost" onClick={() => setConfirming(false)}>
                      Cancel
                    </Button>
                  )}
                </>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={(e) => setShowAll(e.target.checked)}
                  className="size-4"
                />
                Show all rows (not only problems)
              </label>
            </div>
            {running && (
              <div className="bg-muted h-2 w-full overflow-hidden rounded">
                <div
                  className="bg-primary h-full transition-all"
                  style={{ width: `${(done / Math.max(1, ready.length)) * 100}%` }}
                />
              </div>
            )}
            <FormMessage error={runError ?? undefined} />

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left">
                    <th className="px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Student</th>
                    <th className="px-3 py-2 font-medium">Seat</th>
                    <th className="px-3 py-2 text-right font-medium">Rent</th>
                    <th className="px-3 py-2 text-right font-medium">Opening</th>
                    <th className="px-3 py-2 font-medium">Check</th>
                  </tr>
                </thead>
                <tbody>
                  {[...plan.rows]
                    .sort(
                      (a, b) => (a.status === "error" ? 0 : 1) - (b.status === "error" ? 0 : 1) || a.rowNo - b.rowNo,
                    )
                    .filter((r) => showAll || r.status !== "ready")
                    .map((r) => (
                      <tr key={r.rowNo} className={cn("border-b last:border-0", r.status === "error" && "bg-red-50")}>
                        <td className="px-3 py-2 tabular-nums">{r.rowNo}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{r.data?.name ?? r.raw.name}</div>
                          <div className="text-muted-foreground text-xs">{r.data?.phone ?? r.raw.phone}</div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {r.data ? (
                            <>
                              {r.data.building} · {r.data.room}-{r.data.seat}{" "}
                              {(r.newBuilding || r.newRoom || r.newSeat) && <Badge variant="secondary">new</Badge>}
                            </>
                          ) : (
                            `${r.raw.building} · ${r.raw.room}`
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.data ? formatTaka(r.data.rentPaisa) : ""}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.openingDuePaisa > 0 && (
                            <div className="text-red-700">{formatTaka(r.openingDuePaisa)} due</div>
                          )}
                          {r.openingCreditPaisa > 0 && (
                            <div className="text-emerald-700">{formatTaka(r.openingCreditPaisa)} paid/credit</div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {r.status === "ready" ? (
                            <Badge variant="success">OK</Badge>
                          ) : r.status === "skip" ? (
                            <span className="text-muted-foreground text-xs">{r.messages.join("; ")}</span>
                          ) : (
                            <ul className="text-xs text-red-700">
                              {r.messages.map((m) => (
                                <li key={m}>{m}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {!showAll && plan.summary.skip + plan.summary.error === 0 && (
                <p className="text-muted-foreground p-3 text-sm">
                  Every row is OK. Tick &quot;Show all rows&quot; to see them.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Box({ label, value, tone }: { label: string; value: string; tone?: "red" | "green" }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "red" && "text-red-700",
          tone === "green" && "text-emerald-700",
        )}
      >
        {value}
      </p>
    </div>
  );
}
