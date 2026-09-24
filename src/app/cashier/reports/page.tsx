import type { Metadata } from "next";
import { ReportsPage } from "@/components/reports/report-pages";
import { requireRole } from "@/server/auth/session";

export const metadata: Metadata = { title: "Reports" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireRole("cashier");
  return <ReportsPage actor={actor} area="/cashier" searchParams={await searchParams} />;
}
