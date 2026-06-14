"use client";

import type { ProductPlatformOption } from "@playfit/core/types";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { PlayfitProvider } from "../playfit/playfit-context";
import { DecisionShell } from "./decision-shell";

export function PlayPageClient({ platforms }: { platforms: ProductPlatformOption[] }) {
  return (
    <PlayfitProvider platforms={platforms} localFirst>
      <ErrorBoundary>
        <DecisionShell />
      </ErrorBoundary>
    </PlayfitProvider>
  );
}
