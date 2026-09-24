import type { Metadata } from "next";
import { MealReportPage } from "@/components/meals/meal-pages";
import { requireRole } from "@/server/auth/session";

export const metadata: Metadata = { title: "Meal count" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireRole("admin");
  return <MealReportPage actor={actor} basePath="/admin/meals" searchParams={await searchParams} />;
}
