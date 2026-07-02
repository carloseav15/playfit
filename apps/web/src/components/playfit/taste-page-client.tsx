"use client";

import { ErrorBoundary } from "@/components/ui/error-boundary";
import { TasteShell } from "./taste-shell";

export function TastePageClient() {
  return (
    <ErrorBoundary>
      <TasteShell />
    </ErrorBoundary>
  );
}
