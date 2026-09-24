import type { Metadata } from "next";
import { StudentDetailPage } from "@/components/students/student-pages";
import { requireRole } from "@/server/auth/session";

export const metadata: Metadata = { title: "Student" };

export default async function Page({ params }: { params: Promise<{ studentId: string }> }) {
  const actor = await requireRole("admin");
  const { studentId } = await params;
  return <StudentDetailPage actor={actor} basePath="/admin/students" studentId={studentId} />;
}
