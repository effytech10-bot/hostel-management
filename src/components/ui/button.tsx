import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-semibold transition-colors outline-none cursor-pointer disabled:pointer-events-none disabled:opacity-45 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "border border-brand bg-brand text-white hover:bg-brand-600 shadow-xs",
        outline: "border border-line bg-surface text-ink hover:bg-surface-2",
        secondary: "border border-line bg-surface-3 text-ink-2 hover:bg-line/60",
        success: "border border-ok bg-ok text-white hover:bg-ok/90 shadow-xs",
        destructive: "border border-bad bg-bad text-white hover:bg-bad/90 shadow-xs",
        ghost: "border border-transparent bg-transparent text-ink hover:bg-surface-2",
        link: "border border-transparent text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[35px] px-[13px] py-2 text-[13.5px] rounded-[9px]",
        sm: "h-[27px] px-[10px] py-[5px] text-[12.5px] rounded-[8px]",
        lg: "h-10 px-4 py-2 text-[14.5px] rounded-[9px]",
        icon: "size-[35px] p-0 rounded-[9px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
