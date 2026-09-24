"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PASSWORD_MIN } from "@/lib/validation/members";
import type { ActionState } from "@/server/errors";
import { createStaffAction } from "./actions";

export function CreateStaffForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createStaffAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  const err = state.fieldErrors ?? {};

  return (
    <form ref={formRef} action={formAction} className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" required aria-invalid={!!err.fullName} />
        <FieldError errors={err.fullName} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">Phone (used to log in)</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          placeholder="01XXXXXXXXX"
          required
          aria-invalid={!!err.phone}
        />
        <FieldError errors={err.phone} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="role">Role</Label>
        <Select id="role" name="role" defaultValue="cashier" aria-invalid={!!err.role}>
          <option value="cashier">Cashier</option>
          <option value="admin">Admin</option>
        </Select>
        <FieldError errors={err.role} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="text"
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          required
          aria-invalid={!!err.password}
        />
        <FieldError errors={err.password} />
      </div>
      <div className="flex flex-col gap-3 sm:col-span-2">
        <FormMessage error={state.error} message={state.message} />
        <Button type="submit" disabled={pending} className="w-fit">
          {pending ? "Creating…" : "Create user"}
        </Button>
      </div>
    </form>
  );
}
