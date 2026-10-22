import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { addMonths, currentPeriod, formatPeriod, isValidPeriod } from "@/lib/dates";
import { requireRole } from "@/server/auth/session";
import { goLiveChecklist } from "@/server/services/go-live";

export const metadata: Metadata = { title: "Go-live checklist" };

export default async function GoLivePage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  const actor = await requireRole("admin");
  const now = currentPeriod();
  const options = [now, addMonths(now, 1), addMonths(now, 2)];
  const { start: raw } = await searchParams;
  const start = raw && isValidPeriod(raw) && options.includes(raw) ? raw : options[1];
  const steps = await goLiveChecklist(actor, start);
  const left = steps.filter((s) => s.status === "todo").length;

  return (
    <>
      <PageHeader
        title="Go-live checklist"
        description={left ? `${left} step(s) left before the software takes over from Excel.` : "Everything is ready."}
      >
        <div className="flex flex-wrap gap-1.5">
          {options.map((m) => (
            <Button key={m} asChild size="sm" variant={m === start ? "default" : "outline"}>
              <Link href={`/admin/go-live?start=${m}`}>Start {formatPeriod(m)}</Link>
            </Button>
          ))}
        </div>
      </PageHeader>
      <Card>
        <CardContent className="flex flex-col divide-y divide-line-2 py-2">
          {steps.map((s, i) => (
            <div key={s.title} className="flex items-start gap-3.5 py-4">
              {s.status === "done" ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" />
              ) : s.status === "warn" ? (
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn" />
              ) : (
                <Circle className="text-muted mt-0.5 size-5 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink text-[14px]">
                  {i + 1}. {s.title}
                </p>
                <p className="text-muted text-[13px] mt-0.5">{s.detail}</p>
              </div>
              {s.href && (
                <Button asChild size="sm" variant="outline" className="shrink-0">
                  <Link href={s.href}>{s.action}</Link>
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
