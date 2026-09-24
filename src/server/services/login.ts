import "server-only";
import { and, eq } from "drizzle-orm";
import { normalizeBdPhone } from "@/lib/phone";
import { db } from "@/server/db/client";
import { memberships, students } from "@/server/db/schema";
import type { MemberRole } from "@/server/auth/roles";

export type LoginAccount = { authEmail: string; role: MemberRole };

/**
 * Find the internal login email for what the person typed on the login page:
 * a phone number (everyone) or a Student ID (students).
 */
export async function findLoginAccount(identifier: string): Promise<LoginAccount | null> {
  const phone = normalizeBdPhone(identifier);
  if (!phone) {
    const code = identifier.trim();
    if (!/^\d{4,8}$/.test(code)) return null;
    const rows = await db()
      .select({ authEmail: memberships.authEmail, role: memberships.role })
      .from(students)
      .innerJoin(memberships, eq(memberships.id, students.membershipId))
      .where(and(eq(students.studentCode, code), eq(memberships.isActive, true)))
      .limit(2);
    return rows.length === 1 ? rows[0] : null;
  }

  const rows = await db()
    .select({ authEmail: memberships.authEmail, role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.phone, phone), eq(memberships.isActive, true)))
    .limit(2);

  // The same phone in two hostels needs an org picker; not needed until the product is multi-hostel.
  return rows.length === 1 ? rows[0] : null;
}
