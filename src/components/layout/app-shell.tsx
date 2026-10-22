import { KeyRound, LogOut } from "lucide-react";
import Link from "next/link";
import { logoutAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/server/auth/session";
import { NAV } from "./nav";
import { NavLinks } from "./nav-links";

const ROLE_LABEL = { admin: "Admin", cashier: "Cashier", student: "Student" } as const;
const ROLE_COLOR = {
  admin: "#3340b0",
  cashier: "#0c7b7f",
  student: "#c9581a",
} as const;

/** Page frame for every logged-in area: 232px sidebar on desktop, top bar + wrapping menu below 1180px. */
export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const items = NAV[user.role];
  const showMenu = items.length > 1;

  return (
    <div className="bg-bg min-h-dvh min-[1180px]:flex">
      {/* Desktop Sidebar (>= 1180px) */}
      {showMenu && (
        <aside className="border-line bg-surface sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col justify-between overflow-y-auto border-r p-[16px_12px] min-[1180px]:flex">
          <div className="flex flex-col gap-1">
            {/* Top Who block */}
            <div className="who border-line-2 mb-3 flex items-center gap-2.5 border-b px-1.5 pb-3">
              <div
                className="grid size-[34px] shrink-0 place-items-center rounded-full text-[14px] font-bold text-white select-none"
                style={{ backgroundColor: ROLE_COLOR[user.role] }}
              >
                {user.fullName[0]?.toUpperCase() ?? "U"}
              </div>
              <div className="min-w-0 flex-1">
                <b className="text-ink block truncate text-[14px] leading-tight font-bold">{user.fullName}</b>
                <span className="text-muted-foreground mt-0.5 block truncate text-[11.5px]">
                  {ROLE_LABEL[user.role]} · {user.orgName}
                </span>
              </div>
            </div>

            {/* Vertical navigation */}
            <NavLinks items={items} orientation="vertical" />
          </div>

          {/* Bottom user actions */}
          <div className="border-line-2 flex flex-col gap-1 border-t pt-3">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-ink-2 hover:bg-surface-2 w-full justify-start gap-2 font-medium"
            >
              <Link href="/change-password">
                <KeyRound className="size-4 opacity-70" />
                <span>Password</span>
              </Link>
            </Button>
            <form action={logoutAction} className="w-full">
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-bad hover:bg-bad-bg/60 w-full justify-start gap-2 font-medium"
              >
                <LogOut className="size-4 opacity-70" />
                <span>Log out</span>
              </Button>
            </form>
          </div>
        </aside>
      )}

      {/* Main content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Responsive top header for screens < 1180px */}
        <header className="border-line bg-surface flex items-center justify-between gap-3 border-b px-4 py-2.5 min-[1180px]:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className="grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white select-none"
              style={{ backgroundColor: ROLE_COLOR[user.role] }}
            >
              {user.fullName[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="min-w-0">
              <p className="text-ink truncate text-[13.5px] leading-tight font-bold">{user.orgName}</p>
              <p className="text-muted-foreground truncate text-[11.5px]">
                {user.fullName} · {ROLE_LABEL[user.role]}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button asChild variant="ghost" size="sm" title="Change password">
              <Link href="/change-password">
                <KeyRound className="size-4" />
                <span className="hidden sm:inline">Password</span>
              </Link>
            </Button>
            <form action={logoutAction}>
              <Button type="submit" variant="outline" size="sm">
                <LogOut className="size-4" />
                <span className="hidden sm:inline">Log out</span>
              </Button>
            </form>
          </div>
        </header>

        {/* Wrapping navigation strip for screens < 1180px */}
        {showMenu && (
          <div className="border-line bg-surface border-b px-3 py-2 min-[1180px]:hidden">
            <NavLinks items={items} orientation="horizontal" />
          </div>
        )}

        {/* Page content with spec padding */}
        <main className="mx-auto w-full max-w-6xl flex-1 p-[18px_16px_50px] min-[1180px]:p-[24px_28px_60px]">
          {children}
        </main>
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
    <div className="mb-[18px] flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-ink text-[22px] leading-tight font-bold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground mt-[3px] text-[13.5px] leading-normal">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
