"use client";

import type { ProductPlatformOption } from "@playfit/core/types";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { PlayfitProvider } from "./playfit-context";

export function PlayfitRouteProvider({
  children,
  platforms,
  localFirst = false,
}: {
  children: React.ReactNode;
  platforms: ProductPlatformOption[];
  localFirst?: boolean;
}) {
  return (
    <PlayfitProvider platforms={platforms} localFirst={localFirst}>
      <ErrorBoundary>{children}</ErrorBoundary>
    </PlayfitProvider>
  );
}
