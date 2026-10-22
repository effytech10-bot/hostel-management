import type { Metadata } from "next";
import Link from "next/link";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/server/auth/session";
import { getDashboard } from "@/server/services/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default async function CashierDashboard() {
  const user = await requireRole("cashier");
  const data = await getDashboard(user);
  return (
    <>
      <PageHeader title={`Hello, ${user.fullName}`} description={`Today ${data.today} · your buildings only`}>
        <Button asChild>
          <Link href="/cashier/payments/new">+ Take payment</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/cashier/meals">Today&apos;s meals</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/cashier/students">Students</Link>
        </Button>
      </PageHeader>
      <DashboardView data={data} area="/cashier" isAdmin={false} />
    </>
  );
}
