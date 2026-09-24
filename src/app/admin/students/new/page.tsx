import type { Metadata } from "next";
import { NewStudentPage } from "@/components/students/student-pages";
import { requireRole } from "@/server/auth/session";

export const metadata: Metadata = { title: "Admit student" };

export default async function Page() {
  const actor = await requireRole("admin");
  return <NewStudentPage actor={actor} basePath="/admin/students" />;
}
