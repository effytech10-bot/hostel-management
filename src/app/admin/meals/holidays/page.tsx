import type { Metadata } from "next";
import { MealHolidaysPage } from "@/components/meals/meal-pages";
import { requireRole } from "@/server/auth/session";

export const metadata: Metadata = { title: "Meal holidays" };

export default async function Page() {
  const actor = await requireRole("admin");
  return <MealHolidaysPage actor={actor} basePath="/admin/meals" />;
}
