import type { Metadata } from "next";
import { MealDayPage } from "@/components/meals/meal-pages";
import { requireRole } from "@/server/auth/session";

export const metadata: Metadata = { title: "Meals" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireRole("admin");
  return <MealDayPage actor={actor} basePath="/admin/meals" searchParams={await searchParams} />;
}
