"use client";

import { ErrorBoundary } from "@/components/ui/error-boundary";
import { PicksShell } from "./picks-shell";

export function PicksPageClient() {
  return (
    <ErrorBoundary>
      <PicksShell />
    </ErrorBoundary>
  );
}
