import type { Metadata } from "next";
import { TasteShell } from "@/components/playfit-mvp/taste-shell";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export const metadata: Metadata = {
  title: "Your Taste",
  description: "See what Playfit is learning from your decisions.",
};

export default async function TastePage() {
  return (
    <ErrorBoundary>
      <TasteShell />
    </ErrorBoundary>
  );
}
