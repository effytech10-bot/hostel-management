"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PASSWORD_MIN } from "@/lib/validation/members";
import type { ActionState } from "@/server/errors";
import { resetPasswordAction } from "./actions";

export function ResetPasswordForm({ membershipId }: { membershipId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(resetPasswordAction, {});

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="membershipId" value={membershipId} />
      <Input
        name="password"
        type="text"
        placeholder="New password"
        minLength={PASSWORD_MIN}
        required
        className="h-8 w-36 text-xs"
        aria-label="New password"
      />
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="h-8 text-xs">
        {pending ? "Saving…" : "Reset"}
      </Button>
      {state.error && <span className="text-xs text-bad font-semibold">{state.error}</span>}
      {state.ok && <span className="text-xs text-ok font-semibold">{state.message}</span>}
    </form>
  );
}
