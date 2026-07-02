import type { Metadata } from "next";
import { DecisionShell } from "@/components/playfit/decision-shell";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export const metadata: Metadata = {
  title: "Playfit — Game Recommendations",
  description: "Discover what to play next with Playfit's custom gaming decision engine.",
};

export default async function PlayPage() {
  return (
    <ErrorBoundary>
      <DecisionShell />
    </ErrorBoundary>
  );
}
