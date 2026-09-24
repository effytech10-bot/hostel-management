import type { Metadata } from "next";
import { TakePaymentPage } from "@/components/payments/payment-pages";
import { requireRole } from "@/server/auth/session";

export const metadata: Metadata = { title: "Take payment" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireRole("cashier");
  return <TakePaymentPage actor={actor} basePath="/cashier/payments" searchParams={await searchParams} />;
}
