import type { Metadata } from "next";
import { MealDayPage } from "@/components/meals/meal-pages";
import { requireRole } from "@/server/auth/session";

export const metadata: Metadata = { title: "Meals" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireRole("cashier");
  return <MealDayPage actor={actor} basePath="/cashier/meals" searchParams={await searchParams} />;
}
