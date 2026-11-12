import { NextResponse, type NextRequest } from "next/server";
import { currentPeriod, isValidPeriod } from "@/lib/dates";
import { getSessionUser } from "@/server/auth/session";
import { incomeStatementWorkbook } from "@/server/services/income-statement-xlsx";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.mustChangePassword) return new NextResponse("Please log in.", { status: 401 });
  if (user.role !== "admin") return new NextResponse("Not allowed.", { status: 403 });
  const m = request.nextUrl.searchParams.get("month") ?? "";
  const period = isValidPeriod(m) && m <= currentPeriod() ? m : currentPeriod();
  const body = await incomeStatementWorkbook(user, period);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="income-statement-${period}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
