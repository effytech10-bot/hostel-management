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

/**
 * Exact styling from prototype:
 * .mcell.on { background: #e8f7ed; color: #15803d; border-color: #b9e3c6; }
 * .mcell.off { background: #fdecec; color: #b42323; border-color: #f3c3c3; }
 * .mcell.office { background: var(--surface-3); color: var(--muted); border-color: var(--line); }
 */
const CELL: Record<MealDayState, { text: string; className: string; title: string }> = {
  on: {
    text: "✓",
    className: "border-[#b9e3c6] bg-[#e8f7ed] text-[#15803d]",
    title: "Meal on",
  },
  off: {
    text: "✕",
    className: "border-[#f3c3c3] bg-[#fdecec] text-[#b42323]",
    title: "You turned this meal off",
  },
  office_off: {
    text: "✕",
    className: "border-line bg-surface-3 text-muted",
    title: "Turned off by the office. Ask the office to turn it on.",
  },
  holiday: {
    text: "H",
    className: "border-warn-line bg-warn-bg text-warn",
    title: "Hostel holiday",
  },
};

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });

/** Day-by-day meals. Days the student can still change have 40×32px tappable cells. */
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
    return <p className="text-muted text-[13px]">You did not stay in the hostel this month.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <FormMessage error={result.error} />
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line text-muted text-[12px]">
            <th className="py-2 text-left font-semibold">Date</th>
            {MEAL_SLOTS.map((slot) => (
              <th key={slot} className="py-2 text-center font-semibold">
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
                "border-b border-line-2 transition-colors",
                d.date === today && "bg-brand-50/70 font-semibold",
                !d.editable && d.future && "opacity-80",
              )}
            >
              <td className="py-2 pr-1 whitespace-nowrap">
                <span className="font-bold text-ink">{Number(d.date.slice(8))}</span>{" "}
                <span className="text-muted text-[11.5px]">{WEEKDAY.format(new Date(`${d.date}T00:00:00Z`))}</span>
                {d.date === today && <span className="text-brand ml-1 text-[11px] font-bold">today</span>}
                {d.holidayNote && <span className="text-muted block text-[11px]">{d.holidayNote}</span>}
              </td>
              {MEAL_SLOTS.map((slot) => {
                const state = d.slots[slot];
                const cell = CELL[state];
                const canTap = d.editable && (state === "on" || state === "off");
                const key = `${d.date}|${slot}`;
                return (
                  <td key={slot} className="py-1.5 text-center">
                    {canTap ? (
                      <button
                        type="button"
                        onClick={() => toggle(d, slot)}
                        disabled={pendingKey !== null}
                        title={`${cell.title}. Tap to turn ${state === "on" ? "off" : "on"}.`}
                        aria-label={`${MEAL_SLOT_LABEL[slot]} on ${d.date}: ${state === "on" ? "on" : "off"}. Tap to change.`}
                        className={cn(
                          "inline-flex h-[32px] w-[40px] items-center justify-center rounded-[8px] border-2 text-[13px] font-bold cursor-pointer transition-transform active:scale-95 select-none",
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
                          "inline-flex h-[26px] w-[34px] items-center justify-center rounded-[6px] border text-[12px] font-bold opacity-75 select-none",
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
    <form action={formAction} className="flex flex-col gap-3.5">
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
          {e?.from && <p className="text-bad text-xs">{e.from[0]}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meal-to">To (including)</Label>
          <Input id="meal-to" type="date" name="to" min={from || first} max={last} defaultValue={first} required />
          {e?.to && <p className="text-bad text-xs">{e.to[0]}</p>}
        </div>
      </div>

      <fieldset className="flex flex-wrap gap-4 text-[13.5px]">
        <legend className="mb-1.5 text-[12.5px] font-semibold text-ink-2">Meals</legend>
        {MEAL_SLOTS.map((slot) => (
          <label key={slot} className="flex items-center gap-1.5 text-ink cursor-pointer">
            <input type="checkbox" name="slots" value={slot} defaultChecked className="size-4 accent-brand" />
            {MEAL_SLOT_LABEL[slot]}
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-wrap gap-4 text-[13.5px]">
        <legend className="mb-1.5 text-[12.5px] font-semibold text-ink-2">Turn</legend>
        <label className="flex items-center gap-1.5 text-ink cursor-pointer">
          <input type="radio" name="on" value="false" defaultChecked className="size-4 accent-brand" />
          OFF (I will not eat)
        </label>
        <label className="flex items-center gap-1.5 text-ink cursor-pointer">
          <input type="radio" name="on" value="true" className="size-4 accent-brand" />
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
    <form action={action} className="flex flex-col gap-2.5">
      <input type="hidden" name="slot" value={slot} />
      <input type="hidden" name="on" value={on ? "false" : "true"} />
      <div className="flex items-center justify-between gap-3">
        <div className="text-[13px]">
          <p className="font-semibold text-ink">{label} every day</p>
          <p className="text-muted text-[12px] leading-snug">
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
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:opacity-60 cursor-pointer",
            on ? "border-ok bg-ok" : "border-line bg-surface-3",
          )}
        >
          <span
            className={cn(
              "inline-block size-5 rounded-full bg-white shadow-xs transition-transform",
              on ? "translate-x-5.5" : "translate-x-0.5",
            )}
          />
        </button>
      </div>
      {!on && (
        <p className="text-muted text-[11.5px]">
          You can still turn {label.toLowerCase()} on for any single day in the list below.
        </p>
      )}
      <FormMessage error={state.error} message={state.message} className="py-0.5" />
    </form>
  );
}
