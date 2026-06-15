"use client";

import { ErrorBoundary } from "@/components/ui/error-boundary";
import { DecisionShell } from "./decision-shell";

export function PlayPageClient() {
  return (
    <ErrorBoundary>
      <DecisionShell />
    </ErrorBoundary>
  );
}
