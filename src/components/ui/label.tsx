import * as React from "react";
import { cn } from "@/lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "text-ink-2 flex items-center gap-2 text-[12.5px] leading-tight font-semibold select-none",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
