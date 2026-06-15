"use client";

import { ErrorBoundary } from "@/components/ui/error-boundary";
import { DecisionDossier } from "./decision-dossier";

export function PlayDossierClient({ gameId }: { gameId: string }) {
  return (
    <ErrorBoundary>
      <DecisionDossier gameId={gameId} />
    </ErrorBoundary>
  );
}
