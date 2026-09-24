import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { homePathFor } from "@/server/auth/roles";
import { getSessionUser } from "@/server/auth/session";
import { NEW_PASSWORD_MIN } from "@/server/domain/passwords";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Set your password" };

export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/change-password");

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">
            {user.mustChangePassword ? "Set your own password" : "Change password"}
          </CardTitle>
          <CardDescription>
            {user.mustChangePassword
              ? `Hello ${user.fullName}. You logged in with a temporary password. Choose your own password to continue.`
              : `Logged in as ${user.fullName}.`}{" "}
            At least {NEW_PASSWORD_MIN} characters, and not your phone number.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ChangePasswordForm />
          {!user.mustChangePassword && (
            <Link href={homePathFor(user.role)} className="text-muted-foreground text-center text-sm hover:underline">
              Cancel
            </Link>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
