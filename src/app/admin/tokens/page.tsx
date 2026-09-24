import type { Metadata } from "next";
import { TokensPage } from "@/components/tokens/token-pages";
import { requireRole } from "@/server/auth/session";

export const metadata: Metadata = { title: "Tokens" };
export const maxDuration = 300;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireRole("admin");
  return <TokensPage actor={actor} basePath="/admin/tokens" searchParams={await searchParams} />;
}
