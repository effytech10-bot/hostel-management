"use client";

import Link from "next/link";
import { useActionState } from "react";
import { makeEarlyTokenAction } from "@/app/_actions/billing";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import type { ActionState } from "@/server/errors";

/** Admin: make one student's next-month token now. */
export function EarlyTokenButton({
  studentId,
  label,
  confirmText,
  tokensPath,
}: {
  studentId: string;
  label: string;
  confirmText: string;
  tokensPath: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState & { code?: string }, FormData>(
    makeEarlyTokenAction,
    {},
  );
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="studentId" value={studentId} />
      <FormMessage error={state.error} message={state.message} />
      {state.ok && state.code ? (
        <Button asChild className="w-fit">
          <Link href={`${tokensPath}/${state.code}`}>Open {state.code}</Link>
        </Button>
      ) : (
        <Button type="submit" disabled={pending} className="w-fit">
          {pending ? "Making…" : label}
        </Button>
      )}
    </form>
  );
}
