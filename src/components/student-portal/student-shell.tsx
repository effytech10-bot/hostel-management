"use client";

import { Home, KeyRound, LogOut, UtensilsCrossed, User, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/server/auth/session";

const STUDENT_TABS = [
  { label: "Home", href: "/student", icon: Home },
  { label: "Account", href: "/student/account", icon: Wallet },
  { label: "Meals", href: "/student/meals", icon: UtensilsCrossed },
  { label: "Profile", href: "/student/profile", icon: User },
] as const;

export function StudentShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();

  function isTabActive(href: string) {
    if (href === "/student") {
      return pathname === "/student";
    }
    if (href === "/student/account") {
      return pathname.startsWith("/student/account") || pathname.startsWith("/student/tokens");
    }
    return pathname.startsWith(href);
  }

  return (
    <div className="bg-bg min-h-dvh flex flex-col justify-start">
      <div className="mx-auto w-full max-w-[420px] min-h-dvh flex flex-col bg-bg border-x border-line/60 shadow-sm relative">
        {/* White Top Header (Hostel name + student name/role) */}
        <header className="sticky top-0 z-20 border-b border-line bg-surface px-4 py-2.5 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <b className="text-ink block truncate text-[14px] leading-tight font-bold">{user.orgName}</b>
            <span className="text-muted block truncate text-[11.5px] leading-normal mt-0.5">
              {user.fullName} · Student
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted hover:text-ink-2"
              title="Change password"
            >
              <Link href="/change-password">
                <KeyRound className="size-4" />
                <span className="sr-only">Change password</span>
              </Link>
            </Button>
            <form action={logoutAction}>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted hover:text-bad"
                title="Log out"
              >
                <LogOut className="size-4" />
                <span className="sr-only">Log out</span>
              </Button>
            </form>
          </div>
        </header>

        {/* Scrollable phone content body */}
        <main className="flex-1 p-[14px] flex flex-col gap-3 pb-24">{children}</main>

        {/* Fixed bottom navigation tabs bar */}
        <nav
          className="fixed bottom-0 left-0 right-0 z-30 mx-auto max-w-[420px] grid grid-cols-4 bg-surface border-t border-line shadow-sm"
          aria-label="Student Navigation"
        >
          {STUDENT_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = isTabActive(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2 pb-2.5 px-1 text-[11.5px] font-semibold transition-colors select-none",
                  active ? "text-[#c9581a]" : "text-muted hover:text-ink-2",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-5" />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
