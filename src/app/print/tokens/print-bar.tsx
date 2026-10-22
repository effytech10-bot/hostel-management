"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintBar({ count }: { count: number }) {
  return (
    <div className="mx-auto mb-6 flex max-w-[194mm] items-center justify-between gap-3 rounded-[12px] border border-line bg-surface p-3 px-4 shadow-card print:hidden">
      <p className="text-muted text-[13px]">
        <b className="font-bold text-ink">{count}</b> token(s) · {Math.ceil(count / 4)} A4 page(s). In the print dialog
        choose A4 and turn off headers/footers.
      </p>
      <Button onClick={() => window.print()} disabled={count === 0} size="sm" className="gap-1.5 font-bold">
        <Printer className="size-4" />
        <span>Print</span>
      </Button>
    </div>
  );
}
