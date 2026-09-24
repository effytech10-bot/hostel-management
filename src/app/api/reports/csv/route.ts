import { NextResponse, type NextRequest } from "next/server";
import { dhakaDate } from "@/lib/dates";
import { parseReportParams } from "@/lib/report-params";
import { getSessionUser } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { reportCsv, toCsv } from "@/server/services/reports-csv";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.mustChangePassword) return new NextResponse("Please log in.", { status: 401 });
  if (user.role !== "admin" && user.role !== "cashier") return new NextResponse("Not allowed.", { status: 403 });

  const params = parseReportParams(Object.fromEntries(request.nextUrl.searchParams));
  try {
    const { filename, rows } = await reportCsv(user, params);
    return new NextResponse(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}-${dhakaDate()}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return new NextResponse(e.message, { status: e.code === "FORBIDDEN" ? 403 : 400 });
    throw e;
  }
}
