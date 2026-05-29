import { buildTodayModel } from "../domain/recommendations";
import type { RankedSeedGame } from "../types";
import { escapeHtml, type ProductCardAction } from "../ui/helpers";
import { renderDecisionQueueItem, renderRankedGameCard } from "../ui/render";
import type { AppContext } from "./context";

export function renderOutcomeNotice(ctx: AppContext, model: ReturnType<typeof buildTodayModel>) {
  const notice = ctx.ui.outcomeNotice;
  if (!notice) {
    return "";
  }

  const statusLabel =
    notice.status === "abandoned"
      ? "Abandoned"
      : notice.status === "beaten"
        ? "Finished story"
        : "Completed 100%";
  const nextDecision =
    model.currentRun ??
    model.nextUp ??
    model.resume ??
    model.wishlistFit ??
    model.worthTracking ??
    model.playableAlternative;
  const nextCopy = nextDecision
    ? `Your next best option is ${nextDecision.game.title}.`
    : "Add another game when you are ready and the queue will get sharper.";

  return `
    <section class="product-outcome-panel">
      <div class="product-outcome-main">
        <p class="product-eyebrow">Saved</p>
        <h2>${escapeHtml(notice.title)} is now ${escapeHtml(statusLabel)}</h2>
        <p class="product-tagline">${escapeHtml(nextCopy)}</p>
      </div>
      <div class="product-outcome-actions">
        ${nextDecision ? `<button class="product-button product-button-primary" data-action="open-dossier" data-game-id="${escapeHtml(nextDecision.game.gameId)}">See next pick</button>` : ""}
        <button class="product-button product-button-ghost" data-action="dismiss-outcome-notice">Dismiss</button>
      </div>
    </section>
  `;
}

function renderAvoidEntry(entry: RankedSeedGame | null) {
  if (!entry) return "";
  return `
    <section class="product-decision-queue">
      <div class="product-section-header">
        <div>
          <p class="product-eyebrow">Watch out</p>
          <h2>Not every acclaimed game is your game</h2>
        </div>
        <p class="product-note">This one looks attractive but may not click.</p>
      </div>
      <div class="product-decision-queue-list">
        ${renderDecisionQueueItem("Avoid for now", entry, { label: "See why", action: "open-dossier" })}
      </div>
    </section>
  `;
}

export function renderToday(ctx: AppContext) {
  const model = buildTodayModel(
    ctx.seedData.allGames,
    ctx.state,
    ctx.state.user.profile,
    ctx.seedData.gamesById,
  );

  const hero =
    model.currentRun ?? model.nextUp ?? model.resume ?? model.wishlistFit ?? model.worthTracking;

  let heading: string;
  let heroPrimaryAction: ProductCardAction | undefined;

  if (model.currentRun) {
    heading = "Playing now";
    heroPrimaryAction = { label: "Update status", action: "open-dossier" };
  } else if (model.nextUp) {
    heading = "Play next";
    heroPrimaryAction =
      model.nextUp.accessStatus === "playable"
        ? { label: "Play now", action: "start-playing" }
        : { label: "See why", action: "open-dossier" };
  } else if (model.resume) {
    heading = "Resume";
    heroPrimaryAction = { label: "See why", action: "open-dossier" };
  } else if (model.wishlistFit) {
    heading = "Worth adding";
    heroPrimaryAction = { label: "See why", action: "open-dossier" };
  } else if (model.worthTracking) {
    heading = "Worth tracking";
    heroPrimaryAction = { label: "See why", action: "open-dossier" };
  } else {
    heading = "Today";
    heroPrimaryAction = undefined;
  }

  const heroGameState = hero ? ctx.state.user.gameStates[hero.game.gameId] : undefined;
  const heroCanPlay = hero?.accessStatus === "playable";

  const heroSecondaryActions = hero
    ? [
        heroCanPlay && !heroGameState?.inBacklog
          ? { label: "Add to backlog", action: "toggle-backlog" }
          : null,
        heroCanPlay && !heroGameState?.inWishlist
          ? { label: "Add to wishlist", action: "toggle-wishlist" }
          : null,
        model.currentRun ? { label: "Shelve", action: "shelve-game" } : null,
      ].filter((item): item is ProductCardAction => Boolean(item))
    : [];

  const earlyReadNotice =
    hero && hero.confidence === "low"
      ? `<p class="product-note product-early-read">Early read. Log a few outcomes and picks will sharpen.</p>`
      : "";

  const unratedCount = !ctx.ui.unratedBannerDismissed
    ? Object.values(ctx.state.user.gameStates).filter(
        (gs) => gs.rating == null && gs.status != null,
      ).length
    : 0;
  const unratedBanner =
    unratedCount > 0 && ctx.state.user.onboardingCompletedAt
      ? `
    <section class="product-card product-start-banner">
      <button class="product-start-banner-close" data-action="dismiss-unrated-banner" aria-label="Dismiss">✕</button>
      <p class="product-note"><strong>${unratedCount} game${unratedCount > 1 ? "s" : ""} without a rating.</strong> Adding stars helps sharpen your picks. <button class="product-link-button" data-action="switch-tab" data-tab="library">Rate in My Games</button></p>
    </section>
  `
      : "";

  const queueCandidates: Array<[string, RankedSeedGame | null]> = [
    model.currentRun ? ["Also playing", model.nextUp] : ["Play next", model.nextUp],
    ["Resume", model.resume],
    ["Worth adding", model.wishlistFit],
    ["Worth tracking", model.worthTracking],
  ];

  const queueItems = queueCandidates
    .filter((item): item is [string, RankedSeedGame] => Boolean(item[1]))
    .filter(([, entry]) => entry.game.gameId !== hero?.game.gameId)
    .slice(0, 3)
    .map(([label, entry]) =>
      renderDecisionQueueItem(label, entry, { label: "See why", action: "open-dossier" }),
    )
    .join("");

  const avoidEntry = model.avoid ?? model.playableAlternative ?? null;

  return `
    <section class="product-page-stack">
      ${renderOutcomeNotice(ctx, model)}
      ${unratedBanner}
      ${renderRankedGameCard(heading, hero, {
        emphasis: "hero",
        primaryAction: heroPrimaryAction,
        secondaryActions: heroSecondaryActions,
        extraContent: earlyReadNotice,
      })}
      ${
        queueItems
          ? `
        <section class="product-decision-queue">
          <div class="product-section-header">
            <div>
              <p class="product-eyebrow">Also consider</p>
              <h2>Next options</h2>
            </div>
            <p class="product-note">Alternatives if today's pick isn't right.</p>
          </div>
          <div class="product-decision-queue-list">${queueItems}</div>
        </section>
      `
          : ""
      }
      ${renderAvoidEntry(avoidEntry)}
    </section>
  `;
}
