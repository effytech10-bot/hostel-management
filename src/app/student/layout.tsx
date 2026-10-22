import { StudentShell } from "@/components/student-portal/student-shell";
import { requireRole } from "@/server/auth/session";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("student");
  return <StudentShell user={user}>{children}</StudentShell>;
}
