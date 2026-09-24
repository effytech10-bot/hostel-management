"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building,
  FileText,
  LayoutDashboard,
  Receipt,
  Settings,
  UserCog,
  UserRound,
  Users,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavIcon, NavItem } from "./nav";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  building: Building,
  students: Users,
  meals: UtensilsCrossed,
  payments: Wallet,
  tokens: Receipt,
  reports: FileText,
  users: UserCog,
  settings: Settings,
  profile: UserRound,
};

export function NavLinks({ items, orientation }: { items: NavItem[]; orientation: "vertical" | "horizontal" }) {
  const pathname = usePathname();
  // The shortest item (e.g. "/admin") is the area home; it is active only on an exact match.
  const homeHref = items.reduce((a, b) => (a.href.length <= b.href.length ? a : b)).href;

  return (
    <nav className={cn("flex gap-1", orientation === "vertical" ? "flex-col" : "flex-row overflow-x-auto")}>
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active =
          item.href === homeHref
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const base = "flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap";

        if (item.soon) {
          return (
            <span
              key={item.href}
              className={cn(base, "text-muted-foreground/60 cursor-not-allowed")}
              title="Coming soon"
            >
              <Icon className="size-4" />
              {item.label}
              <span className="bg-muted ml-auto rounded px-1.5 text-[10px] uppercase">soon</span>
            </span>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              base,
              active
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
