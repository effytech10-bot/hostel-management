import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { PageHeader } from "@/components/layout/app-shell";
import { requireRole } from "@/server/auth/session";
import { getDashboard } from "@/server/services/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default async function CashierDashboard() {
  const user = await requireRole("cashier");
  const data = await getDashboard(user);
  return (
    <>
      <PageHeader title={`Hello, ${user.fullName}`} description={`Today ${data.today} · your buildings only`} />
      <DashboardView data={data} area="/cashier" isAdmin={false} />
    </>
  );
}
