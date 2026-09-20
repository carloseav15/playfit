import type { Metadata } from "next";
import { PicksShell } from "@/components/playfit/picks-shell";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export const metadata: Metadata = {
  title: "My Picks",
  description: "Games you saved from Play Next, best match first.",
};

export default async function PicksPage() {
  return (
    <ErrorBoundary>
      <PicksShell />
    </ErrorBoundary>
  );
}
