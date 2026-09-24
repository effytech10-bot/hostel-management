import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { PageHeader } from "@/components/layout/app-shell";
import { requireRole } from "@/server/auth/session";
import { countMembersByRole, getDashboard } from "@/server/services/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  const user = await requireRole("admin");
  const [data, counts] = await Promise.all([getDashboard(user), countMembersByRole(user)]);
  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Today ${data.today} · ${counts.student} student logins · ${counts.cashier} cashier(s)`}
      />
      <DashboardView data={data} area="/admin" isAdmin />
    </>
  );
}
