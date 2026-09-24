import "server-only";
import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  AUTH_EMAIL_DOMAIN: z.string().min(3).default("login.rangdhanu.local"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Server-side environment variables, validated on first use. */
export function env(): Env {
  if (!cached) {
    const result = schema.safeParse(process.env);
    if (!result.success) {
      const missing = result.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Invalid or missing environment variables: ${missing}. Check .env.local`);
    }
    cached = result.data;
  }
  return cached;
}
