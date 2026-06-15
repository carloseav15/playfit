import type { Metadata } from "next";
import { DecisionShell } from "@/components/playfit-mvp/decision-shell";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export const metadata: Metadata = {
  title: "Play Next",
  description: "Find what to play next with Playfit.",
};

export default async function PlayPage() {
  return (
    <ErrorBoundary>
      <DecisionShell />
    </ErrorBoundary>
  );
}
