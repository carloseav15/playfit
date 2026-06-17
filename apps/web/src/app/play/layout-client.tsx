"use client";

import type { ProductPlatformOption } from "@playfit/core/types";
import Image from "next/image";
import Link from "next/link";
import { PlayfitProvider, usePlayfit } from "@/components/playfit/playfit-context";
import { SaveIndicator } from "@/components/playfit/save-indicator";

export function PlayLayoutClient({
  children,
  platforms,
}: {
  children: React.ReactNode;
  platforms: ProductPlatformOption[];
}) {
  return (
    <PlayfitProvider platforms={platforms} localFirst>
      <SaveIndicator />
      <PlayLayoutContent>{children}</PlayLayoutContent>
    </PlayfitProvider>
  );
}

function PlayLayoutContent({ children }: { children: React.ReactNode }) {
  const { state } = usePlayfit();
  const profileReady = !!state.user.onboardingCompletedAt && !!state.user.profile;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {profileReady && (
        <header className="border-b border-white/5 bg-background/80 backdrop-blur-xl shrink-0 z-40 sticky top-0">
          <div className="mx-auto flex min-h-16 w-full max-w-5xl items-center justify-between gap-5 px-6">
            <Link href="/" className="flex items-center gap-2.5 no-underline">
              <Image
                src="/playfit_logo.png"
                alt="Playfit Logo"
                width={28}
                height={28}
                className="object-contain"
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
          </div>
        </header>
      )}
      <div className="flex-1 w-full flex flex-col">{children}</div>
    </div>
  );
}
