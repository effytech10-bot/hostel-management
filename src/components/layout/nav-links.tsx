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
    <nav className={cn(orientation === "vertical" ? "flex flex-col gap-[2px]" : "flex flex-wrap items-center gap-1.5")}>
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active =
          item.href === homeHref
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

        const base = cn(
          "flex items-center gap-2.5 rounded-[9px] text-[14px] transition-colors whitespace-nowrap select-none",
          orientation === "vertical" ? "p-[9px_11px]" : "px-3 py-1.5",
        );

        if (item.soon) {
          return (
            <span
              key={item.href}
              className={cn(base, "text-muted-foreground/50 cursor-not-allowed font-medium")}
              title="Coming soon"
            >
              <Icon className="size-[18px] shrink-0 opacity-40" />
              <span>{item.label}</span>
              <span className="bg-surface-3 text-ink-2 ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                soon
              </span>
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
                ? "bg-brand-50 text-brand font-[650] [&_svg]:opacity-100"
                : "text-ink-2 hover:bg-surface-2 font-medium [&_svg]:opacity-80",
            )}
          >
            <Icon className="size-[18px] shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
