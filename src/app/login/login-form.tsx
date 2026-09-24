"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/server/errors";
import { loginAction } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}

      <div className="flex flex-col gap-2">
        <Label htmlFor="identifier">Phone number or Student ID</Label>
        <Input
          id="identifier"
          name="identifier"
          type="text"
          inputMode="numeric"
          autoComplete="username"
          placeholder="01XXXXXXXXX or 10001"
          required
          aria-invalid={!!state.fieldErrors?.identifier}
        />
        <FieldError errors={state.fieldErrors?.identifier} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={!!state.fieldErrors?.password}
        />
        <FieldError errors={state.fieldErrors?.password} />
      </div>

      <FormMessage error={state.error} />

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </Button>
      <p className="text-muted-foreground text-center text-xs">
        Forgot your password? Ask the hostel office to reset it.
      </p>
    </form>
  );
}
