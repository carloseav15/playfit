"use client";

import type { ProductPlatformOption } from "@playfit/core/types";
import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DesktopAppNav } from "@/components/playfit/desktop-app-nav";
import { HeaderProvider, useHeaderContext } from "@/components/playfit/header-context";
import { MobileBottomNav } from "@/components/playfit/mobile-bottom-nav";
import { PlayfitProvider, usePlayfitState } from "@/components/playfit/playfit-context";
import { SaveIndicator } from "@/components/playfit/save-indicator";
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

function PlayLayoutContent({ children }: { children: React.ReactNode }) {
  const { state } = usePlayfitState();
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
                    onClick={() => {
                      if (window.history.length > 1) {
                        router.back();
                      } else {
                        router.push("/");
                      }
                    }}
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
            <DesktopAppNav picksCount={picksCount} />
          </div>
        </header>
      )}
      <div className="flex-1 w-full flex flex-col">{children}</div>

      {profileReady && !pathname?.startsWith("/game/") && (
        <MobileBottomNav picksCount={picksCount} />
      )}
    </div>
  );
}
