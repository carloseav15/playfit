"use client";

import type { ProductPlatformOption } from "@playfit/core/types";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { PlayfitProvider } from "../playfit/playfit-context";
import { DecisionDossier } from "./decision-dossier";

export function PlayDossierClient({
  platforms,
  gameId,
}: {
  platforms: ProductPlatformOption[];
  gameId: string;
}) {
  return (
    <PlayfitProvider platforms={platforms} localFirst>
      <ErrorBoundary>
        <DecisionDossier gameId={gameId} />
      </ErrorBoundary>
    </PlayfitProvider>
  );
}
