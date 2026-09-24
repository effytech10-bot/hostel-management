"use client";

import { useActionState } from "react";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import type { ActionState } from "@/server/errors";
import { changePasswordAction } from "./actions";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(changePasswordAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors}
      />
      <Field
        name="confirm"
        label="New password again"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors}
      />
      <FormMessage error={state.error} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </Button>
    </form>
  );
}
