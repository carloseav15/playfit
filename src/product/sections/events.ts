import {
  applyProfileOverrides,
  canAdvanceOnboarding,
  normalizeProfileSignals,
} from "../domain/onboarding";
import { createInitialState, resetProductState } from "../store/indexed-db";
import type { ProductPlayStatus, ProductProfile, ProductRating } from "../types";
import { nowIso } from "../ui/helpers";
import type { AppContext, ProductTab } from "./context";

export function setupEventListeners(ctx: AppContext) {
  ctx.root.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      return;
    }

    const field = target.dataset.field;
    if (field === "anchor-search" && target instanceof HTMLInputElement) {
      ctx.ui.onboardingQuery = target.value;
      ctx.render();
      return;
    }

    if (field === "finder-query" && target instanceof HTMLInputElement) {
      ctx.ui.finderQuery = target.value;
      ctx.ui.finderSelectedGameId = null;
      ctx.closeModal();
      ctx.render();
      return;
    }

    if (field === "library-query" && target instanceof HTMLInputElement) {
      ctx.ui.libraryQuery = target.value;
      ctx.render();
      return;
    }
  });

  ctx.root.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    if (target.dataset.field === "platform-toggle") {
      const platformId = target.dataset.platformId;
      if (!platformId) return;

      ctx.state.user.onboarding.platforms = ctx.state.user.onboarding.platforms.filter(
        (entry) => entry.platformId !== platformId,
      );

      if (target.checked) {
        ctx.state.user.onboarding.platforms.push({ platformId, status: "available" });
      }

      void ctx.persistState();
      ctx.render();
      return;
    }
  });

  ctx.root.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest<HTMLElement>("[data-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.action;
    const gameId = button.dataset.gameId ?? null;

    // ── Upcoming ──────────────────────────────────────────────
    if (action === "toggle-upcoming-platform") {
      const platformId = button.dataset.platformId;
      if (platformId) {
        if (ctx.ui.upcomingPlatformFilters.has(platformId)) {
          ctx.ui.upcomingPlatformFilters.delete(platformId);
        } else {
          ctx.ui.upcomingPlatformFilters.add(platformId);
        }
        ctx.render();
      }
      return;
    }

    if (action === "show-all-upcoming-platforms") {
      for (const p of ctx.seedData.platforms) {
        ctx.ui.upcomingPlatformFilters.add(p.platformId);
      }
      ctx.render();
      return;
    }

    if (action === "reset-upcoming-platforms") {
      ctx.ui.upcomingPlatformFilters = new Set(
        ctx.state.user.onboarding.platforms
          .filter((entry) => ["available", "limited"].includes(entry.status))
          .map((entry) => entry.platformId),
      );
      ctx.render();
      return;
    }

    // ── Profile ───────────────────────────────────────────────
    if (action === "toggle-profile-priority") {
      const key = button.dataset.profileKey as keyof ProductProfile["priorities"] | undefined;
      if (!ctx.state.user.profile || !key) return;
      const current = ctx.state.user.profile.priorities[key];
      const newValue = current === "low" ? "high" : "low";
      ctx.state.user.profile.priorities[key] = newValue;
      const overrides = ctx.ensureProfileOverrides();
      overrides.priorities = {
        ...overrides.priorities,
        [key]: newValue,
      };
      ctx.state.user.profile = applyProfileOverrides(ctx.state.user.profile, overrides);
      await ctx.persistState();
      ctx.render();
      return;
    }

    if (action === "toggle-profile-risk") {
      const key = button.dataset.riskKey as keyof ProductProfile["avoidPatterns"] | undefined;
      if (!ctx.state.user.profile || !key) return;
      ctx.state.user.profile.avoidPatterns[key] = !ctx.state.user.profile.avoidPatterns[key];
      const overrides = ctx.ensureProfileOverrides();
      overrides.avoidPatterns = {
        ...overrides.avoidPatterns,
        [key]: ctx.state.user.profile.avoidPatterns[key],
      };
      ctx.state.user.profile = normalizeProfileSignals(
        applyProfileOverrides(ctx.state.user.profile, overrides),
      );
      await ctx.persistState();
      ctx.render();
      return;
    }

    if (action === "set-watch-risk") {
      const value = button.dataset.profileValue as ProductProfile["watchVsPlayRisk"] | undefined;
      if (!ctx.state.user.profile || !value) return;
      ctx.state.user.profile.watchVsPlayRisk = value;
      const overrides = ctx.ensureProfileOverrides();
      overrides.watchVsPlayRisk = value;
      ctx.state.user.profile = applyProfileOverrides(ctx.state.user.profile, overrides);
      await ctx.persistState();
      ctx.render();
      return;
    }

    // ── Navigation ────────────────────────────────────────────
    if (action === "switch-tab") {
      const tab = button.dataset.tab as ProductTab | undefined;
      if (tab) {
        ctx.ui.activeTab = tab;
        ctx.ui.dossierGameId = null;
        ctx.ui.profileMode = "overview";
        ctx.ui.outcomeNotice = null;
        ctx.closeModal();
        ctx.setStatusMessage(null);
        ctx.ui.isTabSwitch = true;
        ctx.render();
        window.scrollTo({ top: 0, behavior: "instant" });
      }
      return;
    }

    if (action === "dismiss-outcome-notice") {
      ctx.ui.outcomeNotice = null;
      ctx.render();
      return;
    }

    if (action === "dismiss-unrated-banner") {
      ctx.ui.unratedBannerDismissed = true;
      ctx.render();
      return;
    }

    if (action === "open-profile-edit") {
      ctx.ui.profileMode = "edit";
      ctx.render();
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }

    if (action === "close-profile-edit") {
      ctx.ui.profileMode = "overview";
      ctx.render();
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }

    if (action === "open-dossier" && gameId) {
      ctx.ui.dossierGameId = gameId;
      ctx.setStatusMessage(null);
      ctx.render();
      return;
    }

    if (action === "close-dossier") {
      ctx.ui.dossierGameId = null;
      ctx.setStatusMessage(null);
      ctx.render();
      return;
    }

    if (action === "close-dossier-overlay") {
      if (!(event.target instanceof HTMLElement) || !event.target.closest(".product-modal-layer")) {
        return;
      }
      if (event.target.closest(".product-modal")) {
        return;
      }
      ctx.ui.dossierGameId = null;
      ctx.render();
      return;
    }

    // ── Onboarding ────────────────────────────────────────────
    if (action === "prev-step") {
      ctx.state.user.onboarding.step = "platforms";
      ctx.setStatusMessage(null);
      await ctx.persistState();
      ctx.render();
      return;
    }

    if (action === "next-step") {
      ctx.state.user.onboarding.step = "anchors";
      ctx.setStatusMessage(null);
      await ctx.persistState();
      ctx.render();
      return;
    }

    if (action === "add-anchor" && gameId) {
      ctx.state.user.onboarding.likedGameIds = [
        ...new Set([...ctx.state.user.onboarding.likedGameIds, gameId]),
      ];
      if (!ctx.state.user.gameStates[gameId]) {
        const game = ctx.getSeedGame(gameId);
        if (game) {
          ctx.state.user.gameStates[gameId] = {
            gameId,
            title: game.title,
            inBacklog: false,
            inWishlist: false,
            source: "onboarding",
            createdAt: nowIso(),
            updatedAt: nowIso(),
          };
        }
      }
      await ctx.persistState();
      ctx.render();
      return;
    }

    if (action === "remove-anchor" && gameId) {
      ctx.state.user.onboarding.likedGameIds = ctx.state.user.onboarding.likedGameIds.filter(
        (entry) => entry !== gameId,
      );
      await ctx.persistState();
      ctx.render();
      return;
    }

    if (action === "finalize-onboarding") {
      const draft = ctx.state.user.onboarding;

      if (!canAdvanceOnboarding(draft)) {
        ctx.setStatusMessage("Finish this step first.");
        ctx.render();
        return;
      }

      const profile = ctx.buildProfileFromCurrentData();
      ctx.state.user.profile = profile;

      draft.likedGameIds.forEach((gid) => {
        const gs = ctx.state.user.gameStates[gid];
        if (gs && gs.rating == null) {
          ctx.setStatusMessage("Tip: add star ratings in My Games to sharpen picks.");
        }
      });

      ctx.state.user.onboardingCompletedAt = nowIso();
      ctx.ui.activeTab = "today";
      ctx.setStatusMessage("You're all set. Here are your first picks.");
      await ctx.persistState();
      ctx.render();
      return;
    }

    if (action === "go-setup") {
      ctx.ui.activeTab = "onboarding";
      ctx.ui.dossierGameId = null;
      ctx.render();
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }

    if (action === "go-today") {
      ctx.ui.activeTab = "today";
      ctx.ui.dossierGameId = null;
      ctx.render();
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }

    if (action === "dismiss-start-banner") {
      ctx.ui.startBannerDismissed = true;
      ctx.render();
      return;
    }

    if (action === "recalibrate-profile") {
      ctx.openModal("recalibrate");
      ctx.render();
      return;
    }

    if (action === "confirm-recalibrate-profile") {
      ctx.closeModal();
      if (ctx.state.user.profile) {
        ctx.state.user.profile = ctx.buildProfileFromCurrentData();
        ctx.setStatusMessage("Profile refreshed.");
        await ctx.persistState();
        ctx.render();
      }
      return;
    }

    if (action === "select-finder-result" && gameId) {
      ctx.ui.dossierGameId = gameId;
      ctx.render();
      return;
    }

    // ── Game actions ──────────────────────────────────────────
    if (action === "set-rating" && gameId) {
      const starStr = button.dataset.star;
      if (!starStr) return;
      const star = parseInt(starStr, 10);
      if (Number.isNaN(star) || star < 1 || star > 5) return;

      const rect = button.getBoundingClientRect();
      const x = (event as MouseEvent).clientX - rect.left;
      const gapZone = 7;
      const charWidth = rect.width - gapZone;
      let rating: ProductRating;
      if (x < gapZone) {
        rating = (star - 1) as ProductRating;
      } else if (x < gapZone + charWidth / 2) {
        rating = (star - 0.5) as ProductRating;
      } else {
        rating = star as ProductRating;
      }

      const existing = ctx.getOrCreateGameState(gameId);
      if (!existing) return;

      if (existing.rating === rating) {
        existing.rating = undefined;
        existing.updatedAt = nowIso();
        ctx.refreshAdaptiveProfile();
        ctx.setStatusMessage("Rating cleared");
        await ctx.persistState();
        ctx.render();
        return;
      }

      existing.rating = rating;
      existing.updatedAt = nowIso();

      ctx.refreshAdaptiveProfile();
      ctx.setStatusMessage(`Rated ${rating} ★`);
      await ctx.persistState();
      ctx.render();
      return;
    }

    if (action === "toggle-backlog" && gameId) {
      ctx.toggleFlag(gameId, "inBacklog");
      await ctx.persistState();
      ctx.render();
      return;
    }

    if (action === "toggle-wishlist" && gameId) {
      ctx.toggleFlag(gameId, "inWishlist");
      await ctx.persistState();
      ctx.render();
      return;
    }

    if (action === "toggle-story-completed" && gameId) {
      ctx.toggleFlag(gameId, "storyCompleted");
      await ctx.persistState();
      ctx.render();
      return;
    }

    if (gameId && action === "start-playing") {
      const existing = ctx.getOrCreateGameState(gameId);
      if (existing) {
        existing.status = "playing";
        existing.updatedAt = nowIso();
        ctx.setStatusMessage("Added to your active games.");
        ctx.ui.activeTab = "today";
        void ctx.persistState();
        ctx.render();
      }
      return;
    }

    if (gameId && action === "shelve-game") {
      const existing = ctx.getOrCreateGameState(gameId);
      if (existing) {
        existing.status = "shelved";
        existing.updatedAt = nowIso();
        ctx.closeModal();
        ctx.setStatusMessage("Shelved. You can pick it back up anytime.");
        await ctx.persistState();
        ctx.render();
      }
      return;
    }

    if (gameId && action === "remove-library-game") {
      delete ctx.state.user.gameStates[gameId];
      ctx.closeModal();
      ctx.setStatusMessage(`Game removed from My Games.`);
      await ctx.persistState();
      ctx.render();
      return;
    }

    // ── Utility ───────────────────────────────────────────────
    if (action === "export-data") {
      const blob = new Blob([JSON.stringify(ctx.state.user, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `playfit-export-${nowIso().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      ctx.setStatusMessage("Data exported.");
      ctx.render();
      return;
    }

    if (action === "reset-local-product") {
      await resetProductState();
      const freshState = createInitialState();
      Object.assign(ctx.state, freshState);
      ctx.ui.activeTab = "onboarding";
      ctx.ui.finderQuery = "";
      ctx.ui.dossierGameId = null;
      ctx.ui.profileMode = "overview";
      ctx.closeModal();
      ctx.setStatusMessage("Starting fresh.");
      ctx.render();
    }
  });

  ctx.root.addEventListener("change", async (event) => {
    const target = event.target as HTMLElement;
    if (target.dataset.action !== "set-play-status") return;
    const select = target as HTMLSelectElement;
    const changeGameId = select.dataset.gameId;
    if (!changeGameId) return;

    const status = (select.value || undefined) as ProductPlayStatus | undefined;
    const game = ctx.getSeedGame(changeGameId);
    if (!game) return;

    const existing = ctx.getOrCreateGameState(changeGameId);
    if (!existing) return;

    existing.status = status;
    existing.updatedAt = nowIso();

    if (status && ["beaten", "completed", "abandoned"].includes(status)) {
      ctx.refreshAdaptiveProfile();

      if (status === "abandoned" && existing.rating == null) {
        ctx.setStatusMessage(`Marked as abandoned. Even a 0★ rating helps improve your picks.`);
      }
    }

    await ctx.persistState();
    ctx.render();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (ctx.ui.dossierGameId) {
        ctx.ui.dossierGameId = null;
        ctx.render();
        return;
      }
      if (ctx.ui.activeModal) {
        ctx.closeModal();
        ctx.render();
      }
      return;
    }

    if (event.key === "/" && !event.ctrlKey && !event.metaKey) {
      const active = document.activeElement;
      const isInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
      if (!isInput) {
        event.preventDefault();
        const searchInput = ctx.root.querySelector<HTMLInputElement>(
          'input[data-field="finder-query"], input[data-field="library-query"]',
        );
        searchInput?.focus();
      }
    }
  });
}
