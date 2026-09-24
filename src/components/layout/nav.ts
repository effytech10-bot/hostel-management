import type { MemberRole } from "@/server/auth/roles";

export type NavIcon =
  | "dashboard"
  | "building"
  | "students"
  | "meals"
  | "payments"
  | "tokens"
  | "reports"
  | "users"
  | "settings"
  | "profile";

export type NavItem = {
  label: string;
  href: string;
  icon: NavIcon;
  /** Module not built yet: shown greyed out so everyone sees what is coming. */
  soon?: boolean;
};

export const NAV: Record<MemberRole, NavItem[]> = {
  admin: [
    { label: "Dashboard", href: "/admin", icon: "dashboard" },
    { label: "Buildings", href: "/admin/buildings", icon: "building" },
    { label: "Students", href: "/admin/students", icon: "students" },
    { label: "Meals", href: "/admin/meals", icon: "meals" },
    { label: "Payments", href: "/admin/payments", icon: "payments" },
    { label: "Tokens", href: "/admin/tokens", icon: "tokens" },
    { label: "Reports", href: "/admin/reports", icon: "reports" },
    { label: "Users", href: "/admin/users", icon: "users" },
    { label: "Settings", href: "/admin/settings", icon: "settings" },
  ],
  cashier: [
    { label: "Dashboard", href: "/cashier", icon: "dashboard" },
    { label: "Students", href: "/cashier/students", icon: "students" },
    { label: "Meals", href: "/cashier/meals", icon: "meals" },
    { label: "Payments", href: "/cashier/payments", icon: "payments" },
    { label: "Tokens", href: "/cashier/tokens", icon: "tokens" },
    { label: "Reports", href: "/cashier/reports", icon: "reports" },
  ],
  student: [
    { label: "Home", href: "/student", icon: "dashboard" },
    { label: "Account", href: "/student/account", icon: "payments" },
    { label: "Meals", href: "/student/meals", icon: "meals" },
    { label: "Profile", href: "/student/profile", icon: "profile" },
  ],
};
