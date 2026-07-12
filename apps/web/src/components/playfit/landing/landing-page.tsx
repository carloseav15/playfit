"use client";

import type { ProductPlatformOption } from "@playfit/core/types";
import { useState } from "react";
import { PlayLayoutClient } from "@/app/(play)/layout-client";
import { DecisionShell } from "@/components/playfit/decision-shell";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { LandingDemo } from "./landing-demo";
import { LandingFinalCta } from "./landing-final-cta";
import { LandingHero } from "./landing-hero";
import { LandingProblem } from "./landing-problem";
import { LandingProof } from "./landing-proof";

export function LandingPage({ platforms }: { platforms: ProductPlatformOption[] }) {
  const [started, setStarted] = useState(false);

  // Mounting PlayLayoutClient (and the anonymous Supabase session it creates on first
  // render) is deferred until the visitor actually clicks in — a cold visitor never
  // triggers app state just by looking at the marketing page.
  if (started) {
    return (
      <PlayLayoutClient platforms={platforms}>
        <ErrorBoundary>
          <DecisionShell startInCalibration onExitToLanding={() => setStarted(false)} />
        </ErrorBoundary>
      </PlayLayoutClient>
    );
  }

  const onStart = () => setStarted(true);

  return (
    <main className="relative overflow-hidden">
      <LandingHero onStart={onStart} />
      <LandingProblem />
      <LandingDemo />
      <LandingProof />
      <LandingFinalCta onStart={onStart} />
    </main>
  );
}
