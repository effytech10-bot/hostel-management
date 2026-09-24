import type { MemberRole } from "@/server/db/schema";

export type { MemberRole };

export function homePathFor(role: MemberRole): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "cashier":
      return "/cashier";
    case "student":
      return "/student";
  }
}

/** Only allow redirects to paths inside this app (prevents open redirects). */
export function safeNextPath(next: unknown): string | null {
  if (typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}
