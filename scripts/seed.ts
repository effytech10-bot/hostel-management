/**
 * Creates the organization and the first admin login. Safe to run more than once.
 *
 *   npm run db:seed -- --name "Admin Name" --phone 01XXXXXXXXX --password "at-least-8-chars"
 *
 * Reads Supabase and database settings from .env.local.
 */
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { normalizeBdPhone } from "../src/lib/phone";
import { auditLogs, memberships, organizations } from "../src/server/db/schema";

config({ path: ".env.local", quiet: true });

const ORG = { name: "Rangdhanu Chatrabash", slug: "rangdhanu" };

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in .env.local`);
  return value;
}

async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: "string" },
      phone: { type: "string" },
      password: { type: "string" },
    },
  });
  if (!values.name || !values.phone || !values.password) {
    throw new Error('Usage: npm run db:seed -- --name "Admin Name" --phone 01XXXXXXXXX --password "secret123"');
  }
  const phone = normalizeBdPhone(values.phone);
  if (!phone) throw new Error(`Not a valid Bangladeshi mobile number: ${values.phone}`);
  if (values.password.length < 8) throw new Error("Password must be at least 8 characters");

  const client = postgres(process.env.DIRECT_URL ?? required("DATABASE_URL"), { prepare: false, max: 1 });
  const db = drizzle(client);
  const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1. Organization
    let [org] = await db.select().from(organizations).where(eq(organizations.slug, ORG.slug)).limit(1);
    if (!org) {
      [org] = await db.insert(organizations).values(ORG).returning();
      console.log(`Created organization: ${org.name}`);
    } else {
      console.log(`Organization exists: ${org.name}`);
    }

    // 2. First admin
    const [existing] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.orgId, org.id), eq(memberships.phone, phone)))
      .limit(1);
    if (existing) {
      console.log(`A user with phone ${phone} already exists. Nothing to do.`);
      return;
    }

    const authEmail = `u-${randomUUID()}@${process.env.AUTH_EMAIL_DOMAIN ?? "login.rangdhanu.local"}`;
    const { data, error } = await supabase.auth.admin.createUser({
      email: authEmail,
      password: values.password,
      email_confirm: true,
      user_metadata: { full_name: values.name },
    });
    if (error || !data.user) throw new Error(`Supabase could not create the login: ${error?.message}`);

    try {
      await db.transaction(async (tx) => {
        const [admin] = await tx
          .insert(memberships)
          .values({ orgId: org.id, userId: data.user.id, role: "admin", fullName: values.name!, phone, authEmail })
          .returning({ id: memberships.id });
        await tx.insert(auditLogs).values({
          orgId: org.id,
          actorMembershipId: null,
          action: "membership.create",
          entityType: "membership",
          entityId: admin.id,
          after: { role: "admin", fullName: values.name, phone, via: "seed" },
        });
      });
    } catch (err) {
      await supabase.auth.admin.deleteUser(data.user.id);
      throw err;
    }
    console.log(`Created admin ${values.name} (${phone}). Log in with this phone number and password.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
