"use client";

import type { ProductState } from "@playfit/core/types";
import type React from "react";
import { useEffect } from "react";
import { LANDING_REDIRECT_MARKER } from "@/lib/redirect-to-landing";
import type { ProductTab, ProductUiState } from "./playfit-context-types";

export function useProductTabNavigation({
  activeTab,
  state,
  setUi,
}: {
  activeTab: ProductTab | undefined;
  state: ProductState | null;
  setUi: React.Dispatch<React.SetStateAction<ProductUiState | null>>;
}) {
  useEffect(() => {
    if (!activeTab) return;
    const redirectedFromApp = window.sessionStorage.getItem(LANDING_REDIRECT_MARKER) === "1";
    const referrer = document.referrer ? new URL(document.referrer) : null;
    const redirectedFromSettings =
      redirectedFromApp ||
      (referrer?.origin === window.location.origin &&
        ["/app", "/settings"].includes(referrer.pathname));
    if (window.location.pathname === "/" && redirectedFromSettings) {
      window.sessionStorage.removeItem(LANDING_REDIRECT_MARKER);
      if (window.location.hash) window.history.replaceState(null, "", "/");
      return;
    }

    if (!["/", "/play"].includes(window.location.pathname)) return;
    const hash = activeTab === "today" ? "" : activeTab;
    if (hash) {
      window.location.hash = hash;
    } else if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!state) return;
    const onboardingCompleted = !!state.user.onboardingCompletedAt;

    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "") as ProductTab;
      const validTabs: ProductTab[] = ["today", "onboarding"];
      if (!hash || !validTabs.includes(hash)) return;

      const nextTab = onboardingCompleted || hash === "onboarding" ? hash : "onboarding";
      if (nextTab !== hash) {
        window.history.replaceState(null, "", `${window.location.pathname}#${nextTab}`);
      }

      setUi((current) => {
        if (!current || nextTab === current.activeTab) return current;
        return { ...current, activeTab: nextTab };
      });
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [setUi, state]);
}
