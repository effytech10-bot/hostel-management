import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const noteVariants = cva("flex items-center gap-2.5 rounded-[10px] border p-[10px_12px] text-[13px] leading-normal", {
  variants: {
    variant: {
      neutral: "border-line bg-surface-2 text-ink-2",
      info: "border-brand-100 bg-brand-50 text-ink",
      ok: "border-ok-line bg-ok-bg text-ok",
      warn: "border-warn-line bg-warn-bg text-warn",
      bad: "border-bad-line bg-bad-bg text-bad",
    },
  },
  defaultVariants: {
    variant: "neutral",
  },
});

export type NoteProps = React.ComponentProps<"div"> &
  VariantProps<typeof noteVariants> & {
    icon?: React.ReactNode;
  };

export function Note({ className, variant, icon, children, ...props }: NoteProps) {
  return (
    <div className={cn(noteVariants({ variant }), className)} {...props}>
      {icon && <span className="shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export { noteVariants };
