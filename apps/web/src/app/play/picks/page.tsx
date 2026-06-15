import type { Metadata } from "next";
import { PicksShell } from "@/components/playfit-mvp/picks-shell";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export const metadata: Metadata = {
  title: "Playfit Picks",
  description: "Games Playfit thinks are worth your time next.",
};

export default async function PicksPage() {
  return (
    <ErrorBoundary>
      <PicksShell />
    </ErrorBoundary>
  );
}
