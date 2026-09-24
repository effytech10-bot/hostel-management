"use client";

import { useActionState } from "react";
import { runMonthEndAction } from "@/app/_actions/billing";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import type { ActionState } from "@/server/errors";

export function MonthEndButton({ period, label, confirmText }: { period: string; label: string; confirmText: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(runMonthEndAction, {});
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="period" value={period} />
      <FormMessage error={state.error} message={state.message} />
      {!state.ok && (
        <Button type="submit" size="lg" disabled={pending} className="w-fit">
          {pending ? "Working… (do not close this page)" : label}
        </Button>
      )}
    </form>
  );
}
