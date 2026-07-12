"use client";

import type { ProductPlatformOption } from "@playfit/core/types";
import { useState } from "react";
import { PlayLayoutClient } from "@/app/(play)/layout-client";
import { AuthPanel } from "@/components/playfit/auth-panel";
import { DecisionShell } from "@/components/playfit/decision-shell";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { LandingDemo } from "./landing-demo";
import { LandingFinalCta } from "./landing-final-cta";
import { LandingHero } from "./landing-hero";
import { LandingProblem } from "./landing-problem";
import { LandingProof } from "./landing-proof";

export function LandingPage({ platforms }: { platforms: ProductPlatformOption[] }) {
  const [view, setView] = useState<"landing" | "auth" | "calibration">("landing");

  // Mounting PlayLayoutClient (and the anonymous Supabase session it creates on first
  // render) is deferred until the visitor actually clicks in — a cold visitor never
  // triggers app state just by looking at the marketing page.
  if (view === "calibration") {
    return (
      <PlayLayoutClient platforms={platforms}>
        <ErrorBoundary>
          <DecisionShell startInCalibration onExitToLanding={() => setView("landing")} />
        </ErrorBoundary>
      </PlayLayoutClient>
    );
  }

  if (view === "auth") {
    return (
      <AuthPanel
        onAuth={() => setView("calibration")}
        onContinueLocal={() => setView("calibration")}
        onClose={() => setView("landing")}
      />
    );
  }

  const onStart = () => setView("calibration");

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
