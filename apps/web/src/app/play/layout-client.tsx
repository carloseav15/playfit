"use client";

import type { ProductPlatformOption } from "@playfit/core/types";
import { PlayfitProvider } from "@/components/playfit/playfit-context";
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
      {children}
    </PlayfitProvider>
  );
}
