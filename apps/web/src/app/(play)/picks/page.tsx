import type { Metadata } from "next";
import { PicksShell } from "@/components/playfit/picks-shell";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export const metadata: Metadata = {
  title: "Picks — Your Saved Game Recommendations",
  description: "Manage your personalized game recommendations and active gameplay runs.",
};

export default async function PicksPage() {
  return (
    <ErrorBoundary>
      <PicksShell />
    </ErrorBoundary>
  );
}
