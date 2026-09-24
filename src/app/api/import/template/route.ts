import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { importTemplate } from "@/server/services/student-import";

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.mustChangePassword) return new NextResponse("Please log in.", { status: 401 });
  if (user.role !== "admin") return new NextResponse("Not allowed.", { status: 403 });
  const body = await importTemplate();
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="student-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
