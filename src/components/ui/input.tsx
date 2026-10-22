import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "border-line bg-surface text-ink placeholder:text-muted-foreground flex h-[36px] w-full min-w-0 rounded-[9px] border px-2.5 py-2 text-[14px] shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-brand focus-visible:ring-brand/45 focus-visible:ring-[3px]",
        "aria-invalid:border-bad aria-invalid:ring-bad/20",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
