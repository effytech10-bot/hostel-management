import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-[20px] border px-2 py-0.5 text-[11.5px] font-[650] leading-tight transition-colors",
  {
    variants: {
      variant: {
        default: "border-brand-100 bg-brand-50 text-brand",
        success: "border-ok-line bg-ok-bg text-ok",
        warn: "border-warn-line bg-warn-bg text-warn",
        destructive: "border-bad-line bg-bad-bg text-bad",
        secondary: "border-line bg-surface-3 text-ink-2",
        info: "border-brand-100 bg-brand-50 text-brand",
        outline: "border-line bg-transparent text-ink-2",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
