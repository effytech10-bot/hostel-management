import type { Metadata } from "next";
import { StudentsListPage } from "@/components/students/student-pages";
import { requireRole } from "@/server/auth/session";

export const metadata: Metadata = { title: "Students" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireRole("admin");
  return <StudentsListPage actor={actor} basePath="/admin/students" searchParams={await searchParams} />;
}
