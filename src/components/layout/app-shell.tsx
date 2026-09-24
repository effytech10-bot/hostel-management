import { KeyRound, LogOut } from "lucide-react";
import Link from "next/link";
import { logoutAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/server/auth/session";
import { NAV } from "./nav";
import { NavLinks } from "./nav-links";

const ROLE_LABEL = { admin: "Admin", cashier: "Cashier", student: "Student" } as const;

/** Page frame for every logged-in area: sidebar on desktop, top bar + scrolling menu on phones. */
export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const items = NAV[user.role];
  const showMenu = items.length > 1;

  return (
    <div className="min-h-dvh md:flex">
      {showMenu && (
        <aside className="bg-card hidden w-60 shrink-0 flex-col border-r md:flex">
          <div className="border-b px-5 py-4">
            <p className="font-semibold">{user.orgName}</p>
            <p className="text-muted-foreground text-xs">{ROLE_LABEL[user.role]} panel</p>
          </div>
          <div className="flex-1 p-3">
            <NavLinks items={items} orientation="vertical" />
          </div>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-card flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <p className={showMenu ? "font-semibold md:hidden" : "font-semibold"}>{user.orgName}</p>
            <p className="text-muted-foreground truncate text-sm">
              {user.fullName} · {ROLE_LABEL[user.role]}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" title="Change password">
              <Link href="/change-password">
                <KeyRound />
                <span className="hidden sm:inline">Password</span>
              </Link>
            </Button>
            <form action={logoutAction}>
              <Button type="submit" variant="outline" size="sm">
                <LogOut />
                Log out
              </Button>
            </form>
          </div>
        </header>

        {showMenu && (
          <div className="bg-card border-b px-2 py-2 md:hidden">
            <NavLinks items={items} orientation="horizontal" />
          </div>
        )}

        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      </div>
      {children}
    </div>
  );
}
