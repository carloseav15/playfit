"use client";

import type { ProductPlatformOption } from "@playfit/core/types";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { PlayfitProvider } from "../playfit/playfit-context";
import { TasteShell } from "./taste-shell";

export function TastePageClient({ platforms }: { platforms: ProductPlatformOption[] }) {
  return (
    <PlayfitProvider platforms={platforms} localFirst>
      <ErrorBoundary>
        <TasteShell />
      </ErrorBoundary>
    </PlayfitProvider>
  );
}
