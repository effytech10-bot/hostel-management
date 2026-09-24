import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/server/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("admin");
  return <AppShell user={user}>{children}</AppShell>;
}
