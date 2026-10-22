import type { Metadata } from "next";
import { StudentTokenDetailPage } from "@/components/tokens/student-token-detail";
import { requireRole } from "@/server/auth/session";

export const metadata: Metadata = { title: "Token" };

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const actor = await requireRole("student");
  const { code } = await params;
  return <StudentTokenDetailPage actor={actor} code={code} />;
}
