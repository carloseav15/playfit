"use client";

import type { ProductPlatformOption } from "@playfit/core/types";
import { ArrowLeft, Compass, ListChecks, Settings, SlidersHorizontal } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HeaderProvider, useHeaderContext } from "@/components/playfit/header-context";
import { PlayfitProvider, usePlayfit } from "@/components/playfit/playfit-context";
import { SaveIndicator } from "@/components/playfit/save-indicator";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PlayLayoutClient({
  children,
  platforms,
}: {
  children: React.ReactNode;
  platforms: ProductPlatformOption[];
}) {
  return (
    <PlayfitProvider platforms={platforms} localFirst>
      <HeaderProvider>
        <SaveIndicator />
        <PlayLayoutContent>{children}</PlayLayoutContent>
      </HeaderProvider>
    </PlayfitProvider>
  );
}

const desktopNavItems = [
  { href: "/", label: "Play Next", Icon: Compass },
  { href: "/picks", label: "My Picks", Icon: ListChecks },
  { href: "/taste", label: "My Taste", Icon: SlidersHorizontal },
  { href: "/settings", label: "Settings", Icon: Settings },
];

function PlayLayoutContent({ children }: { children: React.ReactNode }) {
  const { state } = usePlayfit();
  const { config: headerConfig } = useHeaderContext();
  const pathname = usePathname();
  const router = useRouter();
  const profileReady = !!state.user.onboardingCompletedAt && !!state.user.profile;

  const picksCount = Object.values(state.user.gameStates).filter(
    (record) =>
      record.inPlayfitPicks &&
      record.status !== "completed" &&
      record.status !== "beaten" &&
      record.status !== "abandoned" &&
      !record.excluded,
  ).length;

  return (
    <div
      className={cn(
        "min-h-screen flex flex-col bg-background text-foreground md:pb-0",
        profileReady ? "pb-20" : "pb-0",
      )}
    >
      {profileReady && (
        <header className="border-b border-border/60 bg-background/80 backdrop-blur-xl shrink-0 z-40 sticky top-0">
          <div className="mx-auto flex min-h-16 w-full max-w-5xl items-center justify-between gap-5 px-6 relative">
            {headerConfig.onBack ? (
              <>
                <div className="flex items-center md:hidden w-full">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-full mr-2 -ml-2 text-foreground hover:bg-secondary relative z-50"
                    onClick={headerConfig.onBack}
                  >
                    <ArrowLeft className="size-5" />
                    <span className="sr-only">Back</span>
                  </Button>
                  <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
                    <span className="font-display text-base font-black tracking-tight text-foreground">
                      {headerConfig.title}
                    </span>
                  </div>
                </div>
                <Link href="/" className="hidden md:flex items-center gap-2.5 no-underline">
                  <Image
                    src="/playfit_logo_light.png"
                    alt="Playfit Logo"
                    width={28}
                    height={28}
                    className="object-contain dark:hidden"
                    priority
                  />
                  <Image
                    src="/playfit_logo_dark.png"
                    alt="Playfit Logo"
                    width={28}
                    height={28}
                    className="hidden object-contain dark:block"
                    priority
                  />
                  <span className="grid leading-tight">
                    <strong className="font-display text-sm tracking-tight font-black text-foreground">
                      Playfit
                    </strong>
                    <span className="text-[10px] text-muted-foreground">
                      Game decisions you can trust
                    </span>
                  </span>
                </Link>
              </>
            ) : pathname === "/picks" ? (
              <>
                <div className="flex items-center md:hidden absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
                  <span className="font-display text-base font-black tracking-tight text-foreground">
                    Saved Picks
                  </span>
                </div>
                <Link href="/" className="hidden md:flex items-center gap-2.5 no-underline">
                  <Image
                    src="/playfit_logo_light.png"
                    alt="Playfit Logo"
                    width={28}
                    height={28}
                    className="object-contain dark:hidden"
                    priority
                  />
                  <Image
                    src="/playfit_logo_dark.png"
                    alt="Playfit Logo"
                    width={28}
                    height={28}
                    className="hidden object-contain dark:block"
                    priority
                  />
                  <span className="grid leading-tight">
                    <strong className="font-display text-sm tracking-tight font-black text-foreground">
                      Playfit
                    </strong>
                    <span className="text-[10px] text-muted-foreground">
                      Game decisions you can trust
                    </span>
                  </span>
                </Link>
              </>
            ) : pathname === "/taste" ? (
              <>
                <div className="flex items-center md:hidden absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
                  <span className="font-display text-base font-black tracking-tight text-foreground">
                    My Taste
                  </span>
                </div>
                <Link href="/" className="hidden md:flex items-center gap-2.5 no-underline">
                  <Image
                    src="/playfit_logo_light.png"
                    alt="Playfit Logo"
                    width={28}
                    height={28}
                    className="object-contain dark:hidden"
                    priority
                  />
                  <Image
                    src="/playfit_logo_dark.png"
                    alt="Playfit Logo"
                    width={28}
                    height={28}
                    className="hidden object-contain dark:block"
                    priority
                  />
                  <span className="grid leading-tight">
                    <strong className="font-display text-sm tracking-tight font-black text-foreground">
                      Playfit
                    </strong>
                    <span className="text-[10px] text-muted-foreground">
                      Game decisions you can trust
                    </span>
                  </span>
                </Link>
              </>
            ) : pathname?.startsWith("/game/") ? (
              <>
                <div className="flex items-center md:hidden w-full">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-full mr-2 -ml-2 text-foreground hover:bg-secondary relative z-50"
                    onClick={() => router.back()}
                  >
                    <ArrowLeft className="size-5" />
                    <span className="sr-only">Back</span>
                  </Button>
                  <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
                    <span className="font-display text-base font-black tracking-tight text-foreground">
                      Game Analysis
                    </span>
                  </div>
                </div>
                <Link href="/" className="hidden md:flex items-center gap-2.5 no-underline">
                  <Image
                    src="/playfit_logo_light.png"
                    alt="Playfit Logo"
                    width={28}
                    height={28}
                    className="object-contain dark:hidden"
                    priority
                  />
                  <Image
                    src="/playfit_logo_dark.png"
                    alt="Playfit Logo"
                    width={28}
                    height={28}
                    className="hidden object-contain dark:block"
                    priority
                  />
                  <span className="grid leading-tight">
                    <strong className="font-display text-sm tracking-tight font-black text-foreground">
                      Playfit
                    </strong>
                    <span className="text-[10px] text-muted-foreground">
                      Game decisions you can trust
                    </span>
                  </span>
                </Link>
              </>
            ) : pathname === "/settings" ? (
              <>
                <div className="flex items-center md:hidden absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
                  <span className="font-display text-base font-black tracking-tight text-foreground">
                    Settings
                  </span>
                </div>
                <Link href="/" className="hidden md:flex items-center gap-2.5 no-underline">
                  <Image
                    src="/playfit_logo_light.png"
                    alt="Playfit Logo"
                    width={28}
                    height={28}
                    className="object-contain dark:hidden"
                    priority
                  />
                  <Image
                    src="/playfit_logo_dark.png"
                    alt="Playfit Logo"
                    width={28}
                    height={28}
                    className="hidden object-contain dark:block"
                    priority
                  />
                  <span className="grid leading-tight">
                    <strong className="font-display text-sm tracking-tight font-black text-foreground">
                      Playfit
                    </strong>
                    <span className="text-[10px] text-muted-foreground">
                      Game decisions you can trust
                    </span>
                  </span>
                </Link>
              </>
            ) : (
              <Link href="/" className="flex items-center gap-2.5 no-underline">
                <Image
                  src="/playfit_logo_light.png"
                  alt="Playfit Logo"
                  width={28}
                  height={28}
                  className="object-contain dark:hidden"
                  priority
                />
                <Image
                  src="/playfit_logo_dark.png"
                  alt="Playfit Logo"
                  width={28}
                  height={28}
                  className="hidden object-contain dark:block"
                  priority
                />
                <span className="grid leading-tight">
                  <strong className="font-display text-sm tracking-tight font-black text-foreground">
                    Playfit
                  </strong>
                  <span className="text-[10px] text-muted-foreground">
                    Game decisions you can trust
                  </span>
                </span>
              </Link>
            )}
            <nav className="hidden md:flex items-center gap-1 rounded-2xl border border-border/60 bg-secondary/60 p-1">
              {desktopNavItems.map(({ href, label, Icon }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
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
                      <span className="flex size-4 items-center justify-center rounded-full bg-accent text-[9px] font-black text-white">
                        {picksCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
            <ThemeToggle className="relative right-0 top-0 size-10 z-40 hidden md:flex" />
          </div>
        </header>
      )}
      <div className="flex-1 w-full flex flex-col">{children}</div>

      {profileReady && !pathname?.startsWith("/game/") && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-background/90 backdrop-blur-xl md:hidden pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
          <div className="flex h-16 items-center justify-around px-4">
            <Link
              href="/"
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-[10px] font-black uppercase tracking-wider transition-colors w-20",
                pathname === "/" ? "text-accent" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Compass className="size-5" />
              <span>Play Next</span>
            </Link>

            <Link
              href="/picks"
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-[10px] font-black uppercase tracking-wider transition-colors relative w-20",
                pathname === "/picks"
                  ? "text-accent"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <div className="relative">
                <ListChecks className="size-5" />
                {picksCount > 0 && (
                  <span className="absolute -top-1 -right-2 flex size-3.5 items-center justify-center rounded-full bg-accent text-[8px] font-black text-white">
                    {picksCount}
                  </span>
                )}
              </div>
              <span>My Picks</span>
            </Link>

            <Link
              href="/taste"
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-[10px] font-black uppercase tracking-wider transition-colors w-20",
                pathname === "/taste"
                  ? "text-accent"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <SlidersHorizontal className="size-5" />
              <span>My Taste</span>
            </Link>

            <Link
              href="/settings"
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-[10px] font-black uppercase tracking-wider transition-colors w-20",
                pathname === "/settings"
                  ? "text-accent"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Settings className="size-5" />
              <span>Settings</span>
            </Link>
          </div>
        </nav>
      )}
    </div>
  );
}
