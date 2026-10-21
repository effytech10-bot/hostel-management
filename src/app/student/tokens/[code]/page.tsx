import type { Metadata } from "next";
import { TokenDetailPage } from "@/components/tokens/token-pages";
import { requireRole } from "@/server/auth/session";

export const metadata: Metadata = { title: "Token" };

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const actor = await requireRole("student");
  const { code } = await params;
  return <TokenDetailPage actor={actor} basePath="/student/tokens" code={code} />;
}
