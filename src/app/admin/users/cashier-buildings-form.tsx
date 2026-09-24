"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/errors";
import { setCashierBuildingsAction } from "./actions";

export function CashierBuildingsForm({
  membershipId,
  buildings,
  selected,
}: {
  membershipId: string;
  buildings: { id: string; code: string }[];
  selected: string[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(setCashierBuildingsAction, {});
  const summary =
    selected.length === 0
      ? "None"
      : buildings
          .filter((b) => selected.includes(b.id))
          .map((b) => b.code)
          .join(", ");

  if (buildings.length === 0) return <span className="text-muted-foreground text-xs">Add buildings first</span>;

  return (
    <details>
      <summary className="cursor-pointer text-sm select-none">
        <span className={selected.length === 0 ? "text-amber-700" : ""}>{summary}</span>
      </summary>
      <form action={formAction} className="mt-2 flex flex-col gap-2">
        <input type="hidden" name="membershipId" value={membershipId} />
        <div className="grid grid-cols-3 gap-x-4 gap-y-1">
          {buildings.map((b) => (
            <label key={b.id} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="buildingIds" value={b.id} defaultChecked={selected.includes(b.id)} />
              {b.code}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          {state.error && <span className="text-xs text-red-600">{state.error}</span>}
          {state.ok && <span className="text-xs text-emerald-700">{state.message}</span>}
        </div>
      </form>
    </details>
  );
}
