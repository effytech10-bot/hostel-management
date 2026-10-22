import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { homePathFor } from "@/server/auth/roles";
import { getSessionUser } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getSessionUser();
  if (user) redirect(homePathFor(user.role));

  const { next } = await searchParams;

  return (
    <main className="bg-bg flex min-h-dvh items-center justify-center p-4">
      <Card className="shadow-card w-full max-w-[380px]">
        <CardHeader className="pb-2 text-center">
          <div className="mx-auto mb-2 flex items-center justify-center">
            <div className="bg-head grid size-10 place-items-center rounded-[10px]">
              <span className="text-lg font-bold text-white">R</span>
            </div>
          </div>
          <CardTitle className="text-ink text-[20px] font-bold">Rangdhanu Chatrabash</CardTitle>
          <CardDescription className="text-muted-foreground mt-1 text-[13px]">
            <span className="font-bangla font-medium">রংধনু ছাত্রাবাস</span> · Log in with your phone number or Student
            ID
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <LoginForm next={next} />
        </CardContent>
      </Card>
    </main>
  );
}
