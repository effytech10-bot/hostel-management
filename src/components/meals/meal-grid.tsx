"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { saveMealDayAction } from "@/app/_actions/meals";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MEAL_SLOT_LABEL, MEAL_SLOTS, type MealSlot } from "@/server/domain/meals";
import type { ActionState } from "@/server/errors";
import type { MealDayRow } from "@/server/services/meals";

type OffMap = Record<string, MealSlot[]>;

function toMap(rows: MealDayRow[]): OffMap {
  return Object.fromEntries(rows.map((r) => [r.studentId, r.off]));
}

export function MealGrid({
  buildingId,
  date,
  rows,
  holidays,
  readOnlyReason,
}: {
  buildingId: string;
  date: string;
  rows: MealDayRow[];
  holidays: Partial<Record<MealSlot, string>>;
  readOnlyReason: string | null;
}) {
  const [saved, setSaved] = useState<OffMap>(() => toMap(rows));
  const [offs, setOffs] = useState<OffMap>(() => toMap(rows));
  const [filter, setFilter] = useState("");
  // What was sent with the last save; becomes the "saved" baseline when the save succeeds.
  const submitted = useRef<OffMap>(offs);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const result = await saveMealDayAction(prev, fd);
    if (result.ok) setSaved(submitted.current);
    return result;
  }, {});

  const readOnly = readOnlyReason !== null;
  const isOff = (id: string, slot: MealSlot) => !!holidays[slot] || (offs[id] ?? []).includes(slot);

  const changes = useMemo(
    () =>
      rows.reduce((n, r) => {
        const a = [...(offs[r.studentId] ?? [])].sort().join();
        const b = [...(saved[r.studentId] ?? [])].sort().join();
        return n + (a === b ? 0 : 1);
      }, 0),
    [rows, offs, saved],
  );

  const onCount = (slot: MealSlot) => rows.filter((r) => !isOff(r.studentId, slot)).length;

  function toggle(id: string, slot: MealSlot) {
    if (readOnly || holidays[slot]) return;
    setOffs((prev) => {
      const current = prev[id] ?? [];
      return { ...prev, [id]: current.includes(slot) ? current.filter((s) => s !== slot) : [...current, slot] };
    });
  }

  function setColumn(slot: MealSlot, off: boolean) {
    if (readOnly || holidays[slot]) return;
    setOffs((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        const current = next[r.studentId] ?? [];
        next[r.studentId] = off ? [...new Set([...current, slot])] : current.filter((s) => s !== slot);
      }
      return next;
    });
  }

  const q = filter.trim().toLowerCase();
  const visible = q
    ? rows.filter(
        (r) =>
          r.fullName.toLowerCase().includes(q) || r.roomNumber.toLowerCase().includes(q) || r.studentCode.includes(q),
      )
    : rows;

  const payload = JSON.stringify({
    buildingId,
    date,
    studentIds: rows.map((r) => r.studentId),
    offs: rows.flatMap((r) => (offs[r.studentId] ?? []).map((slot) => ({ studentId: r.studentId, slot }))),
  });

  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No students had a seat in this building on this date.</p>;
  }

  return (
    <form
      action={formAction}
      onSubmit={() => {
        submitted.current = offs;
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="payload" value={payload} />

      <div className="grid grid-cols-3 gap-2">
        {MEAL_SLOTS.map((slot) => (
          <div key={slot} className="bg-card rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">{MEAL_SLOT_LABEL[slot]} — to cook</p>
            <p className="text-2xl font-semibold tabular-nums">{holidays[slot] ? "—" : onCount(slot)}</p>
            {holidays[slot] && <p className="truncate text-xs text-amber-700">Holiday: {holidays[slot]}</p>}
          </div>
        ))}
      </div>

      {readOnly && <FormMessage error={readOnlyReason} />}

      {rows.some((r) => r.byStudent.length > 0) && (
        <p className="text-muted-foreground text-xs">
          &quot;by student&quot; = the student turned this meal off from their phone. &quot;daily off&quot; = the
          student turned it off for every day.
        </p>
      )}

      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by name, room or Student ID"
        className="sm:max-w-sm"
      />

      <div className="bg-card overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="px-3 py-2 font-medium">Seat</th>
              <th className="px-3 py-2 font-medium">Student</th>
              {MEAL_SLOTS.map((slot) => (
                <th key={slot} className="px-2 py-2 text-center font-medium">
                  <div>{MEAL_SLOT_LABEL[slot]}</div>
                  {!readOnly && !holidays[slot] && (
                    <div className="mt-1 flex justify-center gap-1 text-[11px] font-normal">
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => setColumn(slot, false)}
                      >
                        all on
                      </button>
                      <span>·</span>
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => setColumn(slot, true)}
                      >
                        all off
                      </button>
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.studentId} className="border-b last:border-0">
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                  {r.roomNumber}-{r.seatLabel}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.fullName}</div>
                  <div className="text-muted-foreground text-xs tabular-nums">ID {r.studentCode}</div>
                </td>
                {MEAL_SLOTS.map((slot) => {
                  const off = isOff(r.studentId, slot);
                  const holiday = !!holidays[slot];
                  return (
                    <td key={slot} className="px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => toggle(r.studentId, slot)}
                        disabled={readOnly || holiday}
                        aria-pressed={!off}
                        aria-label={`${MEAL_SLOT_LABEL[slot]} ${off ? "off" : "on"} for ${r.fullName}`}
                        className={cn(
                          "h-9 w-16 rounded-md border text-xs leading-tight font-semibold transition-colors",
                          off
                            ? "border-red-200 bg-red-50 text-red-700"
                            : "border-emerald-300 bg-emerald-50 text-emerald-800",
                          (readOnly || holiday) && "cursor-not-allowed opacity-60",
                        )}
                      >
                        {holiday ? "HOLIDAY" : off ? "OFF" : "ON"}
                        {off && !holiday && r.byStudent.includes(slot) && (
                          <span className="block text-[9px] leading-none font-normal">
                            {r.normallyOff.includes(slot) ? "daily off" : "by student"}
                          </span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <div className="bg-background/95 sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
          <Button type="submit" disabled={pending || changes === 0}>
            {pending ? "Saving…" : "Save meals"}
          </Button>
          <span className="text-muted-foreground text-sm">
            {changes === 0 ? "No unsaved changes" : `${changes} student(s) changed — not saved yet`}
          </span>
          <FormMessage error={state.error} message={changes === 0 ? state.message : undefined} className="py-1" />
        </div>
      )}
    </form>
  );
}
