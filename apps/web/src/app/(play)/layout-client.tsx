"use client";

import type { ProductPlatformOption } from "@playfit/core/types";
import { usePathname } from "next/navigation";
import { Profiler } from "react";
import { AppHeader } from "@/components/playfit/app-header";
import { HeaderProvider, useHeaderContext } from "@/components/playfit/header-context";
import { MobileBottomNav } from "@/components/playfit/mobile-bottom-nav";
import { PlayfitProvider, usePlayfitState } from "@/components/playfit/playfit-context";
import { SaveIndicator } from "@/components/playfit/save-indicator";
import { reportRender } from "@/lib/render-metrics";
import { cn } from "@/lib/utils";

export function PlayLayoutClient({
  children,
  platforms,
}: {
  children: React.ReactNode;
  platforms: ProductPlatformOption[];
}) {
  return (
    <Profiler id="PlayfitProvider" onRender={reportRender}>
      <PlayfitProvider platforms={platforms} localFirst>
        <HeaderProvider>
          <SaveIndicator />
          <PlayLayoutContent>{children}</PlayLayoutContent>
        </HeaderProvider>
      </PlayfitProvider>
    </Profiler>
  );
}

function PlayLayoutContent({ children }: { children: React.ReactNode }) {
  const { state } = usePlayfitState();
  const { config: headerConfig } = useHeaderContext();
  const pathname = usePathname();
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
        <AppHeader pathname={pathname ?? ""} headerConfig={headerConfig} picksCount={picksCount} />
      )}
      <div className="flex-1 w-full flex flex-col">{children}</div>

      {profileReady && !pathname?.startsWith("/game/") && (
        <MobileBottomNav picksCount={picksCount} />
      )}
    </div>
  );
}
