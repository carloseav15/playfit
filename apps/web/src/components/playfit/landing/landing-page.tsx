"use client";

import { useEffect, useState } from "react";
import { AuthPanel } from "@/components/playfit/auth-panel";
import { DecisionShell } from "@/components/playfit/decision-shell";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { LANDING_REDIRECT_MARKER } from "@/lib/redirect-to-landing";
import { useAppEntry } from "../app-entry";
import { LandingDemo } from "./landing-demo";
import { LandingFinalCta } from "./landing-final-cta";
import { LandingHero } from "./landing-hero";
import { LandingProblem } from "./landing-problem";
import { LandingProof } from "./landing-proof";

export function LandingPage() {
  const entry = useAppEntry();
  const [view, setView] = useState<"landing" | "auth">("landing");

  useEffect(() => {
    const redirectedFromApp = window.sessionStorage.getItem(LANDING_REDIRECT_MARKER) === "1";
    const referrer = document.referrer ? new URL(document.referrer) : null;
    if (
      window.location.pathname === "/" &&
      window.location.hash === "#onboarding" &&
      (redirectedFromApp ||
        (referrer?.origin === window.location.origin &&
          ["/app", "/settings"].includes(referrer.pathname)))
    ) {
      window.sessionStorage.removeItem(LANDING_REDIRECT_MARKER);
      window.history.replaceState(null, "", "/");
    }
  }, []);

  if (entry.started) {
    return (
      <ErrorBoundary>
        <DecisionShell startInCalibration onExitToLanding={entry.exit} />
      </ErrorBoundary>
    );
  }

  if (view === "auth") {
    return (
      <AuthPanel
        onAuth={entry.start}
        onContinueLocal={entry.start}
        onClose={() => setView("landing")}
      />
    );
  }

  const onStart = entry.start;

  return (
    <main className="relative overflow-hidden">
      <LandingHero onStart={onStart} onSignIn={() => setView("auth")} />
      <LandingProblem />
      <LandingDemo />
      <LandingProof />
      <LandingFinalCta onStart={onStart} />
    </main>
  );
}
