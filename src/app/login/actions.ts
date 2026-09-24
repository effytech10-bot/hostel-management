"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { loginSchema } from "@/lib/validation/auth";
import { homePathFor, safeNextPath } from "@/server/auth/roles";
import type { ActionState } from "@/server/errors";
import { findLoginAccount } from "@/server/services/login";
import { createSupabaseServerClient } from "@/server/supabase/server";

const INVALID = "Wrong phone number / Student ID or password.";

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Please fill in both fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const account = await findLoginAccount(parsed.data.identifier);
  if (!account) return { error: INVALID };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: account.authEmail,
    password: parsed.data.password,
  });
  if (error) return { error: INVALID };

  redirect(safeNextPath(parsed.data.next) ?? homePathFor(account.role));
}

export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
