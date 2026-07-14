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

// The Next.js client router treats (play)/layout.tsx as a stable segment across
// same-layout navigations and reuses whatever it already has mounted there instead of
// re-running the layout. For a cold visitor, that mounted output is the provider-less
// `isRootLanding` branch (see (play)/layout.tsx) — this ad-hoc PlayLayoutClient below is
// invisible to that router tree, so a normal <Link> click to /taste, /picks, /settings,
// etc. from inside it would graft the destination page into the provider-less branch and
// crash with "usePlayfit must be used inside PlayfitProvider." Forcing a full navigation
// for any link that leaves "/" sidesteps the stale reuse: it hits the server fresh, where
// (play)/layout.tsx correctly mounts the single, real provider for the new path.
function forceHardNavigationForInternalLinks(event: React.MouseEvent<HTMLDivElement>) {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const anchor = (event.target as HTMLElement).closest("a");
  if (!anchor?.href) return;
  if (anchor.target && anchor.target !== "_self") return;
  if (anchor.hasAttribute("download")) return;

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return;
  if (url.pathname === window.location.pathname) return;

  event.preventDefault();
  window.location.href = anchor.href;
}

export function LandingPage({ platforms }: { platforms: ProductPlatformOption[] }) {
  const [view, setView] = useState<"landing" | "auth" | "calibration">("landing");

  // Mounting PlayLayoutClient (and the anonymous Supabase session it creates on first
  // render) is deferred until the visitor actually clicks in — a cold visitor never
  // triggers app state just by looking at the marketing page.
  if (view === "calibration") {
    return (
      <div onClickCapture={forceHardNavigationForInternalLinks}>
        <PlayLayoutClient platforms={platforms}>
          <ErrorBoundary>
            <DecisionShell startInCalibration onExitToLanding={() => setView("landing")} />
          </ErrorBoundary>
        </PlayLayoutClient>
      </div>
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
