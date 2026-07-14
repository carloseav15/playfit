import type { Metadata } from "next";
import { DecisionShell } from "@/components/playfit/decision-shell";
import { LandingPage } from "@/components/playfit/landing/landing-page";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { isReturningVisitor } from "@/lib/returning-visitor";
import { fetchPlatforms } from "@/lib/supabase/platforms";

export const metadata: Metadata = {
  title: "Never Waste Time on the Wrong Game Again",
  description:
    "Tell Playfit what you've loved and what didn't land. It finds your next best match — in your library or not — with the reasons attached, not a wall of star ratings.",
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
