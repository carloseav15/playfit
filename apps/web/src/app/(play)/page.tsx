import type { Metadata } from "next";
import { DecisionShell } from "@/components/playfit/decision-shell";
import { LandingPage } from "@/components/playfit/landing/landing-page";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { isReturningVisitor } from "@/lib/returning-visitor";
import { fetchPlatforms } from "@/lib/supabase/platforms";

export const metadata: Metadata = {
  title: "Playfit — Game Recommendations",
  description: "Discover what to play next with Playfit's custom gaming decision engine.",
};

export default async function PlayPage() {
  if (!(await isReturningVisitor())) {
    // Fetched independently of (play)/layout.tsx, which skips this fetch entirely for
    // cold visitors — LandingPage needs it ready for the moment the visitor clicks in,
    // so the app can mount instantly with no extra round trip.
    const platforms = await fetchPlatforms().catch(() => []);
    return <LandingPage platforms={platforms} />;
  }

  return (
    <ErrorBoundary>
      <DecisionShell />
    </ErrorBoundary>
  );
}
