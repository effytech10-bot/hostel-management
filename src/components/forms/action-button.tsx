"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/errors";

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  children: React.ReactNode;
  pendingLabel?: string;
  confirm?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
};

/** A one-button form (delete, reserve, add seat...). Shows its own error, asks for confirmation if needed. */
export function ActionButton({
  action,
  fields,
  children,
  pendingLabel,
  confirm,
  variant = "outline",
  size = "sm",
  className,
}: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="inline-flex flex-col items-start gap-1"
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button type="submit" variant={variant} size={size} disabled={pending} className={className}>
        {pending ? (pendingLabel ?? "Saving…") : children}
      </Button>
      {state.error && <span className="max-w-60 text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
