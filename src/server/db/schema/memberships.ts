import { boolean, index, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { organizations } from "./organizations";

export const memberRoles = ["admin", "cashier", "student"] as const;
export type MemberRole = (typeof memberRoles)[number];
export const memberRole = pgEnum("member_role", memberRoles);

/**
 * A person who can log in, and their role inside one organization.
 * user_id = Supabase Auth user id (auth.users.id).
 * People log in with their phone number; auth_email is an internal login email
 * that is never shown to anyone.
 */
export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    userId: uuid("user_id").notNull(),
    role: memberRole("role").notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    authEmail: text("auth_email").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    /** Set when someone else chose the password (admission default, admin reset). Cleared when the person sets their own. */
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("memberships_org_user_uq").on(t.orgId, t.userId),
    uniqueIndex("memberships_org_phone_uq").on(t.orgId, t.phone),
    index("memberships_user_idx").on(t.userId),
    index("memberships_phone_idx").on(t.phone),
  ],
).enableRLS();

export type Membership = typeof memberships.$inferSelect;
