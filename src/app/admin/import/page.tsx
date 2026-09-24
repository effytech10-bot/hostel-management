import { Download } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addMonths, currentPeriod } from "@/lib/dates";
import { requireRole } from "@/server/auth/session";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Import students" };

export default async function ImportPage() {
  await requireRole("admin");
  const now = currentPeriod();
  return (
    <>
      <PageHeader
        title="Import students from Excel"
        description="For going live: bring every current student, their seat and what they owe into the software at once."
      >
        <Button asChild variant="outline">
          <a href="/api/import/template">
            <Download />
            Download the Excel template
          </a>
        </Button>
      </PageHeader>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground flex flex-col gap-1 text-sm">
          <p>
            1. Download the template. Fill one row per student (yellow columns are required). Copy from the old sheets.
          </p>
          <p>2. Buildings, rooms and seats that do not exist yet are created automatically.</p>
          <p>
            3. Dues columns = what each student owes up to the day before the start date. &quot;Advance paid&quot; = the
            rent advance the hostel is holding.
          </p>
          <p>4. Upload, check the list, then import. Uploading the same file again skips students already imported.</p>
        </CardContent>
      </Card>
      <ImportWizard months={[now, addMonths(now, 1), addMonths(now, 2)]} />
    </>
  );
}
