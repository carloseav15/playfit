"use client";

import type { ProductPlatformOption } from "@playfit/core/types";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { PlayLayoutClient } from "@/app/(play)/layout-client";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { platformsResponseSchema } from "@/lib/api-contracts";
import { startStartupPrefetch } from "@/lib/startup-prefetch";
import { AppHeader } from "./app-header";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { getOnboardingFlowHeaders } from "./onboarding-flow-tracing";

const AppEntryContext = createContext({
  started: false,
  start: () => {},
  exit: () => {},
});

export function useAppEntry() {
  return useContext(AppEntryContext);
}

export function AppEntry({
  children,
  initiallyActive,
}: {
  children: React.ReactNode;
  initiallyActive: boolean;
}) {
  const pathname = usePathname();
  const [started, setStarted] = useState(false);
  const [platforms, setPlatforms] = useState<ProductPlatformOption[] | null>(null);
  const active =
    started ||
    platforms !== null ||
    (pathname !== "/search" && (initiallyActive || pathname !== "/"));
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const entry = useMemo(
    () => ({
      started,
      start: () => setStarted(true),
      exit: () => setStarted(false),
    }),
    [started],
  );

  useEffect(() => {
    if (!active || platforms) return;
    void startStartupPrefetch({
      includeToday: pathname === "/",
      headers: getOnboardingFlowHeaders("recommendation_fetch"),
    });
  }, [active, platforms, pathname]);

  useEffect(() => {
    if (!active || platforms) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let cancelled = false;
    setError(false);
    void fetch("/api/platforms", {
      signal: controller.signal,
      cache: attempt > 0 ? "reload" : "default",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Catalog unavailable");
        return platformsResponseSchema.parse(await response.json());
      })
      .then((data) => {
        if (!cancelled)
          setPlatforms(
            data.platforms.map((platform) => ({
              ...platform,
              family: platform.family ?? "other",
              kind: (["console", "handheld", "hybrid", "computer"].includes(platform.kind ?? "")
                ? platform.kind
                : "other") as ProductPlatformOption["kind"],
              sortOrder: platform.sortOrder ?? 0,
            })),
          );
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [active, platforms, attempt]);

  return (
    <AppEntryContext.Provider value={entry}>
      {!active ? (
        children
      ) : platforms ? (
        <PlayLayoutClient platforms={platforms}>{children}</PlayLayoutClient>
      ) : (
        <>
          <AppHeader pathname={pathname ?? ""} headerConfig={{}} picksCount={0} />
          <Container as="main" size="sm" className="grid gap-4 py-8 pb-24">
            <h1 className="text-2xl font-bold">
              {error ? "The catalog could not load" : "Getting Playfit ready"}
            </h1>
            <p role="status">
              {error
                ? "Check your connection and try again. You can still navigate to another section."
                : "Loading platforms. Navigation remains available."}
            </p>
            {error ? (
              <Button onClick={() => setAttempt((value) => value + 1)}>Try again</Button>
            ) : null}
          </Container>
          <MobileBottomNav />
        </>
      )}
    </AppEntryContext.Provider>
  );
}
