import type { Metadata } from "next";
import { StudentsListPage } from "@/components/students/student-pages";
import { requireRole } from "@/server/auth/session";

export const metadata: Metadata = { title: "Students" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireRole("cashier");
  return <StudentsListPage actor={actor} basePath="/cashier/students" searchParams={await searchParams} />;
}
