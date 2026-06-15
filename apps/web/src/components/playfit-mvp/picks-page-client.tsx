"use client";

import type { ProductPlatformOption } from "@playfit/core/types";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { PlayfitProvider } from "../playfit/playfit-context";
import { PicksShell } from "./picks-shell";

export function PicksPageClient({ platforms }: { platforms: ProductPlatformOption[] }) {
  return (
    <PlayfitProvider platforms={platforms} localFirst>
      <ErrorBoundary>
        <PicksShell />
      </ErrorBoundary>
    </PlayfitProvider>
  );
}
