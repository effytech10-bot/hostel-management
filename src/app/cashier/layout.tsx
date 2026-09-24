import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/server/auth/session";

export default async function CashierLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("cashier");
  return <AppShell user={user}>{children}</AppShell>;
}
