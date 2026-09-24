import type { Metadata } from "next";
import { MealReportPage } from "@/components/meals/meal-pages";
import { requireRole } from "@/server/auth/session";

export const metadata: Metadata = { title: "Meal count" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireRole("cashier");
  return <MealReportPage actor={actor} basePath="/cashier/meals" searchParams={await searchParams} />;
}
