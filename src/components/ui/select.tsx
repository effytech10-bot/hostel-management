import * as React from "react";
import { cn } from "@/lib/utils";

/** Native select styled like Input. Simple and reliable on low-end phones. */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "border-input bg-background flex h-10 w-full rounded-md border px-3 py-2 text-base shadow-xs outline-none md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
