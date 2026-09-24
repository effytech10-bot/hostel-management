import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/server/auth/session";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("student");
  return <AppShell user={user}>{children}</AppShell>;
}
