import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type TabItem = {
  key: string;
  label: React.ReactNode;
  href?: string;
  active?: boolean;
  onClick?: () => void;
};

export type TabsNavProps = {
  items: TabItem[];
  className?: string;
};

export function TabsNav({ items, className }: TabsNavProps) {
  return (
    <nav className={cn("flex flex-wrap items-center gap-1", className)}>
      {items.map((tab) => {
        const baseClasses = cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-[8px] border text-[13px] font-semibold px-[13px] py-[7px] transition-colors cursor-pointer",
          tab.active
            ? "border-brand bg-brand text-white shadow-xs"
            : "border-line bg-surface text-ink-2 hover:bg-surface-2",
        );

        if (tab.href) {
          return (
            <Link key={tab.key} href={tab.href} className={baseClasses}>
              {tab.label}
            </Link>
          );
        }

        return (
          <button key={tab.key} type="button" onClick={tab.onClick} className={baseClasses}>
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
