"use client";

import { Button } from "@/components/ui/button";

export function PrintBar({ count }: { count: number }) {
  return (
    <div className="mx-auto mb-6 flex max-w-[194mm] items-center justify-between gap-3 print:hidden">
      <p className="text-sm">
        {count} token(s) · {Math.ceil(count / 4)} A4 page(s). In the print dialog choose A4 and turn off
        headers/footers.
      </p>
      <Button onClick={() => window.print()} disabled={count === 0}>
        Print
      </Button>
    </div>
  );
}
