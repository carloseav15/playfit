import type { Metadata } from "next";
import { TasteShell } from "@/components/playfit-mvp/taste-shell";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export const metadata: Metadata = {
  title: "Your Gaming Taste Profile",
  description: "Explore what Playfit is learning from your active decisions and ratings.",
};

export default async function TastePage() {
  return (
    <ErrorBoundary>
      <TasteShell />
    </ErrorBoundary>
  );
}
