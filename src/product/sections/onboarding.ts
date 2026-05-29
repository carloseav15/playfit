import { canAdvanceOnboarding } from "../domain/onboarding";
import { escapeHtml, getOnboardingGateMessage } from "../ui/helpers";
import { renderStars } from "../ui/render";
import type { AppContext } from "./context";

export function renderOnboarding(ctx: AppContext) {
  const draft = ctx.state.user.onboarding;
  const canAdvance = canAdvanceOnboarding(draft);
  const gateMessage = getOnboardingGateMessage(ctx.state);
  const steps = [
    ["platforms", "Platforms"],
    ["anchors", "Anchors"],
  ] as const;
  const hasPlatforms = draft.platforms.length > 0;
  const stepIndex = steps.findIndex(([step]) => step === draft.step);
  const stepPills = `
    <div class="product-step-progress">
      ${steps
        .map(
          ([step, label], i) => `
        <span class="product-step-progress-item${draft.step === step ? " is-active" : i < stepIndex ? " is-done" : ""}">
          <span class="product-step-progress-num">${i < stepIndex ? "✓" : i + 1}</span>
          <span class="product-step-progress-label">${escapeHtml(label)}</span>
        </span>
        ${i < steps.length - 1 ? '<span class="product-step-progress-sep">›</span>' : ""}
      `,
        )
        .join("")}
    </div>
  `;
  const platformRows = ctx.seedData.platforms
    .map((platform) => {
      const checked = draft.platforms.some((entry) => entry.platformId === platform.platformId);
      return `
        <label class="product-platform-checkbox${checked ? " is-checked" : ""}">
          <input
            type="checkbox"
            class="product-platform-check"
            data-field="platform-toggle"
            data-platform-id="${escapeHtml(platform.platformId)}"
            ${checked ? "checked" : ""}
          >
          <span class="product-platform-label">
            <strong>${escapeHtml(platform.displayName)}</strong>
            <span class="product-field-hint">${escapeHtml(platform.family.charAt(0).toUpperCase() + platform.family.slice(1))}</span>
          </span>
        </label>
      `;
    })
    .join("");

  const likedResults = ctx.getAnchorResults();
  let stepMarkup = "";

  if (draft.step === "platforms") {
    stepMarkup = `
      <div class="product-grid">
        <div class="product-step-head">
          <p class="product-eyebrow">Step 1 of 2</p>
          <h1>What are you gaming on?</h1>
          <p class="product-tagline">Pick the platforms you can use right now.</p>
        </div>
        <div class="product-platform-grid">${platformRows}</div>
      </div>
    `;
  }

  if (draft.step === "anchors") {
    const selectedMarkup = draft.likedGameIds.length
      ? draft.likedGameIds
          .map((gameId) => {
            const game = ctx.seedData.gamesById.get(gameId);
            if (!game) return "";
            const gs = ctx.state.user.gameStates[gameId];
            return `
            <article class="product-anchor-selection product-anchor-selection-simple">
              <div class="product-anchor-selection-head">
                <div>
                  <strong>${escapeHtml(game.title)}</strong>
                  <p class="product-meta">${escapeHtml(game.series || game.primaryGenre || "Catalog")}</p>
                </div>
                <button type="button" class="product-button product-button-ghost product-button-sm" data-action="remove-anchor" data-game-id="${escapeHtml(gameId)}">Remove</button>
              </div>
              <div class="product-anchor-inline-actions">
                ${renderStars(gs?.rating, gameId, true)}
                <div class="product-anchor-inline-toggles">
                  <button type="button" class="product-pill-button${gs?.inBacklog ? " is-selected" : ""}" data-action="toggle-backlog" data-game-id="${escapeHtml(gameId)}">Backlog</button>
                  <button type="button" class="product-pill-button${gs?.inWishlist ? " is-selected" : ""}" data-action="toggle-wishlist" data-game-id="${escapeHtml(gameId)}">Wishlist</button>
                </div>
              </div>
            </article>
          `;
          })
          .join("")
      : `<p class="product-empty">Search and add games you've loved.</p>`;

    stepMarkup = `
      <div class="product-grid">
        <div class="product-step-head">
          <p class="product-eyebrow">Step 2 of 2</p>
          <h1>Which games have you loved?</h1>
          <p class="product-tagline">Add 3 games that clicked with you. Ratings and lists are optional.</p>
          <div class="product-anchor-progress">
            <span class="product-chip ${draft.likedGameIds.length >= 3 ? "product-chip-positive" : ""}">${draft.likedGameIds.length}/3 loved</span>
          </div>
        </div>
        <div class="product-anchor-card">
          <label class="product-field">
            <span class="product-field-hint">Search title or series</span>
            <input class="product-input" type="search" data-field="anchor-search" value="${escapeHtml(ctx.ui.onboardingQuery)}" placeholder="Type a game title">
          </label>
          <div class="product-anchor-selected-list">${selectedMarkup}</div>
          <div class="product-results-list">
            ${likedResults
              .map((game) => {
                const alreadySelected = draft.likedGameIds.includes(game.gameId);
                return `
                <button type="button" class="product-result-card${alreadySelected ? " is-selected" : ""}" data-action="add-anchor" data-game-id="${escapeHtml(game.gameId)}" ${alreadySelected ? "disabled" : ""}>
                  <div class="product-result-top">
                    <div>
                      <h3>${escapeHtml(game.title)}</h3>
                      <p class="product-meta">${escapeHtml(game.series || game.primaryGenre)}</p>
                    </div>
                    <span class="product-score">${escapeHtml(game.source === "universe" ? "Broad list" : "Curated")}</span>
                  </div>
                </button>
              `;
              })
              .join("")}
          </div>
        </div>
      </div>
    `;
  }

  const alreadyOnboarded = !!ctx.state.user.onboardingCompletedAt;

  return `
    <section class="product-step-card">
      ${stepPills}
      <div class="product-step-body">
        ${stepMarkup}
      </div>
      <div class="product-actions">
        ${draft.step === "anchors" ? '<button class="product-button product-button-ghost" data-action="prev-step">Back</button>' : ""}
        ${draft.step === "platforms" && hasPlatforms ? '<button class="product-button product-button-primary" data-action="next-step">Continue</button>' : ""}
        ${draft.step === "anchors" && canAdvance ? '<button class="product-button product-button-primary" data-action="finalize-onboarding">Build my profile</button>' : ""}
      </div>
      ${draft.step === "platforms" && !hasPlatforms ? `<p class="product-gate-message">Pick at least one platform to continue.</p>` : ""}
      ${draft.step === "anchors" && !canAdvance ? `<p class="product-gate-message">${escapeHtml(gateMessage)}</p>` : ""}
      ${alreadyOnboarded ? `<div class="product-reset-zone"><button class="product-button product-button-ghost" data-action="reset-local-product">Clear all data and start over</button></div>` : ""}
    </section>
  `;
}
