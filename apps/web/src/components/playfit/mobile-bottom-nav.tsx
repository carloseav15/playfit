"use client";

import { Compass, ListChecks, Search, Settings, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Play Next", Icon: Compass },
  { href: "/picks", label: "My Picks", Icon: ListChecks },
  { href: "/taste", label: "My Taste", Icon: SlidersHorizontal },
  { href: "/search", label: "Search", Icon: Search },
  { href: "/settings", label: "Settings", Icon: Settings },
];

// Session-independent (no PlayfitProvider dependency) so it can be used both inside
// the (play) app shell and on /search, which deliberately lives outside that shell.
export function MobileBottomNav({ picksCount = 0 }: { picksCount?: number }) {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-background/90 backdrop-blur-xl md:hidden pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
      <div className="flex h-16 items-center justify-around px-4">
        {navItems.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-[10px] font-black uppercase tracking-wider transition-colors relative w-20",
                active ? "text-accent" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <div className="relative">
                <Icon className="size-5" />
                {href === "/picks" && picksCount > 0 && (
                  <span className="absolute -top-1 -right-2 flex size-3.5 items-center justify-center rounded-full bg-accent text-[8px] font-black text-slate-950">
                    {picksCount}
                  </span>
                )}
              </div>
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
