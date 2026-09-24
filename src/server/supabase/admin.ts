import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/server/env";

let adminClient: SupabaseClient | undefined;

/**
 * Supabase client with the SECRET key. Full access, bypasses RLS.
 * Only for server code that manages logins (create user, reset password).
 */
export function supabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY } = env();
    adminClient = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}
