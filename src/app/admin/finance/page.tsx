import type { Metadata } from "next";
import { FinancePage } from "@/components/finance/finance-pages";
import { requireRole } from "@/server/auth/session";

export const metadata: Metadata = { title: "Finance" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireRole("admin");
  return <FinancePage actor={actor} searchParams={await searchParams} />;
}
