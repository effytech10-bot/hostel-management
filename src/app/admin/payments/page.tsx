import type { Metadata } from "next";
import { PaymentsListPage } from "@/components/payments/payment-pages";
import { requireRole } from "@/server/auth/session";

export const metadata: Metadata = { title: "Payments" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireRole("admin");
  return <PaymentsListPage actor={actor} basePath="/admin/payments" searchParams={await searchParams} />;
}
