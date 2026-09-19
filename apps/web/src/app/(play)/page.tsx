import type { Metadata } from "next";
import { DecisionShell } from "@/components/playfit/decision-shell";
import { LandingPage } from "@/components/playfit/landing/landing-page";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { isReturningVisitor } from "@/lib/returning-visitor";

export const metadata: Metadata = {
  title: "Never Waste Time on the Wrong Game Again",
  description:
    "Tell Playfit what you've loved and what didn't land. It finds your next best match — in your library or not — with the reasons attached, not a wall of star ratings.",
};

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string }>;
}) {
  if (!(await isReturningVisitor())) {
    return <LandingPage />;
  }

  // Set by /auth/callback for a freshly authenticated user with no profile yet, so
  // onboarding opens immediately instead of DecisionShell treating the missing profile
  // as a stale session and bouncing back to the marketing page.
  const { onboarding } = await searchParams;

  return (
    <ErrorBoundary>
      <DecisionShell startInCalibration={onboarding === "1"} />
    </ErrorBoundary>
  );
}
