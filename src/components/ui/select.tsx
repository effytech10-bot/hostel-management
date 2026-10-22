import * as React from "react";
import { cn } from "@/lib/utils";

/** Native select styled like Input. Simple and reliable on low-end phones. */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "border-line bg-surface text-ink flex h-[36px] w-full rounded-[9px] border px-2.5 py-2 text-[14px] shadow-xs transition-[color,box-shadow] outline-none",
        "focus-visible:border-brand focus-visible:ring-brand/45 focus-visible:ring-[3px]",
        "aria-invalid:border-bad disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
