"use client";

import { Compass, ListChecks, Search, Settings, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const desktopNavItems = [
  { href: "/", label: "Play Next", Icon: Compass },
  { href: "/picks", label: "My Picks", Icon: ListChecks },
  { href: "/taste", label: "My Taste", Icon: SlidersHorizontal },
  { href: "/search", label: "Search", Icon: Search },
  { href: "/settings", label: "Settings", Icon: Settings },
];

export function DesktopAppNav({ picksCount = 0 }: { picksCount?: number }) {
  const pathname = usePathname();

  return (
    <nav className="hidden md:flex items-center gap-1 rounded-2xl border border-border/60 bg-secondary/60 p-1">
      {desktopNavItems.map(({ href, label, Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-xs font-bold no-underline transition-all",
              active
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/80",
            )}
          >
            <Icon className="size-4" />
            {label}
            {href === "/picks" && picksCount > 0 && (
              <span className="flex size-4 items-center justify-center rounded-full bg-accent text-[9px] font-black text-slate-950">
                {picksCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
