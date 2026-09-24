"use client";

import { useActionState, useState, useTransition } from "react";
import { setMyDailyMealAction, setMyMealsAction } from "@/app/_actions/student-meals";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { MEAL_SLOT_LABEL, MEAL_SLOTS, type MealSlot } from "@/server/domain/meals";
import type { ActionState } from "@/server/errors";
import type { MealDayState, MyMealDay } from "@/server/services/student-portal";

const CELL: Record<MealDayState, { text: string; className: string; title: string }> = {
  on: { text: "✓", className: "border-emerald-300 bg-emerald-50 text-emerald-800", title: "Meal on" },
  off: { text: "✕", className: "border-red-200 bg-red-50 text-red-700", title: "You turned this meal off" },
  office_off: {
    text: "✕",
    className: "border-transparent bg-muted text-muted-foreground",
    title: "Turned off by the office. Ask the office to turn it on.",
  },
  holiday: { text: "H", className: "border-transparent bg-amber-100 text-amber-800", title: "Hostel holiday" },
};

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });

/** Day-by-day meals. Days the student can still change have tappable cells. */
export function MyMealCalendar({ days, today }: { days: MyMealDay[]; today: string }) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [result, setResult] = useState<ActionState>({});
  const [, startTransition] = useTransition();

  function toggle(day: MyMealDay, slot: MealSlot) {
    const state = day.slots[slot];
    if (!day.editable || (state !== "on" && state !== "off") || pendingKey) return;
    const fd = new FormData();
    fd.set("from", day.date);
    fd.set("to", day.date);
    fd.append("slots", slot);
    fd.set("on", state === "off" ? "true" : "false");
    const key = `${day.date}|${slot}`;
    setPendingKey(key);
    startTransition(async () => {
      const r = await setMyMealsAction({}, fd);
      setResult(r.ok ? {} : r);
      setPendingKey(null);
    });
  }

  if (days.length === 0) {
    return <p className="text-muted-foreground text-sm">You did not stay in the hostel this month.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <FormMessage error={result.error} />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-xs">
            <th className="py-1 text-left font-normal">Date</th>
            {MEAL_SLOTS.map((slot) => (
              <th key={slot} className="py-1 font-normal">
                {MEAL_SLOT_LABEL[slot]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr
              key={d.date}
              className={cn(
                "border-t",
                d.date === today && "bg-primary/5 font-medium",
                !d.editable && d.future && "opacity-80",
              )}
            >
              <td className="py-1.5 pr-2 whitespace-nowrap">
                {Number(d.date.slice(8))}{" "}
                <span className="text-muted-foreground text-xs">{WEEKDAY.format(new Date(`${d.date}T00:00:00Z`))}</span>
                {d.date === today && <span className="text-primary ml-1 text-xs">today</span>}
                {d.holidayNote && <span className="text-muted-foreground block text-xs">{d.holidayNote}</span>}
              </td>
              {MEAL_SLOTS.map((slot) => {
                const state = d.slots[slot];
                const cell = CELL[state];
                const canTap = d.editable && (state === "on" || state === "off");
                const key = `${d.date}|${slot}`;
                return (
                  <td key={slot} className="py-1 text-center">
                    {canTap ? (
                      <button
                        type="button"
                        onClick={() => toggle(d, slot)}
                        disabled={pendingKey !== null}
                        title={`${cell.title}. Tap to turn ${state === "on" ? "off" : "on"}.`}
                        aria-label={`${MEAL_SLOT_LABEL[slot]} on ${d.date}: ${state === "on" ? "on" : "off"}. Tap to change.`}
                        className={cn(
                          "inline-flex h-9 w-12 items-center justify-center rounded-md border-2 text-sm font-semibold shadow-xs",
                          cell.className,
                          pendingKey === key && "animate-pulse",
                        )}
                      >
                        {pendingKey === key ? "…" : cell.text}
                      </button>
                    ) : (
                      <span
                        title={cell.title}
                        className={cn(
                          "inline-flex h-7 w-10 items-center justify-center rounded-md border text-xs font-semibold opacity-70",
                          cell.className,
                        )}
                      >
                        {cell.text}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Turn meals off (or back on) for several days at once, e.g. when going home. */
export function MealRangeForm({ first, last }: { first: string; last: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(setMyMealsAction, {});
  const [from, setFrom] = useState(first);
  const e = state.fieldErrors;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meal-from">From</Label>
          <Input
            id="meal-from"
            type="date"
            name="from"
            min={first}
            max={last}
            value={from}
            onChange={(ev) => setFrom(ev.target.value)}
            required
          />
          {e?.from && <p className="text-destructive text-xs">{e.from[0]}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meal-to">To (including)</Label>
          <Input id="meal-to" type="date" name="to" min={from || first} max={last} defaultValue={first} required />
          {e?.to && <p className="text-destructive text-xs">{e.to[0]}</p>}
        </div>
      </div>

      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="mb-2 text-sm font-medium">Meals</legend>
        {MEAL_SLOTS.map((slot) => (
          <label key={slot} className="flex items-center gap-2">
            <input type="checkbox" name="slots" value={slot} defaultChecked className="size-4" />
            {MEAL_SLOT_LABEL[slot]}
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="mb-2 text-sm font-medium">Turn</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="on" value="false" defaultChecked className="size-4" />
          OFF (I will not eat)
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="on" value="true" className="size-4" />
          Back ON
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <FormMessage error={state.error} message={state.message} className="py-1" />
      </div>
    </form>
  );
}

/** "Breakfast every day" switch: OFF = no breakfast every day from the next day that can still be changed. */
export function DailyMealSwitch({
  slot,
  on,
  since,
  from,
  today,
}: {
  slot: MealSlot;
  on: boolean;
  since: string | null;
  from: string;
  today: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setMyDailyMealAction, {});
  const label = MEAL_SLOT_LABEL[slot];
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="slot" value={slot} />
      <input type="hidden" name="on" value={on ? "false" : "true"} />
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm">
          <p className="font-medium">{label} every day</p>
          <p className="text-muted-foreground">
            {on
              ? `ON. Turn it off to skip ${label.toLowerCase()} every day from ${formatDate(from)}.`
              : since && since > today
                ? `OFF every day from ${formatDate(since)}.`
                : `OFF every day${since ? ` since ${formatDate(since)}` : ""}. Turn it on to eat ${label.toLowerCase()} again from ${formatDate(from)}.`}
          </p>
        </div>
        <button
          type="submit"
          role="switch"
          aria-checked={on}
          aria-label={`${label} every day`}
          disabled={pending}
          className={cn(
            "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border-2 transition-colors disabled:opacity-60",
            on ? "border-emerald-600 bg-emerald-500" : "border-slate-300 bg-slate-200",
          )}
        >
          <span
            className={cn(
              "inline-block size-6 rounded-full bg-white shadow transition-transform",
              on ? "translate-x-6" : "translate-x-0.5",
            )}
          />
        </button>
      </div>
      {!on && (
        <p className="text-muted-foreground text-xs">
          You can still turn {label.toLowerCase()} on for any single day in the list below.
        </p>
      )}
      <FormMessage error={state.error} message={state.message} className="py-1" />
    </form>
  );
}
