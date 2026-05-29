import {
  HIGH_FRICTION_THRESHOLD,
  STRONG_FIT_THRESHOLD,
  scoreSeedGame,
} from "../domain/recommendations";
import type { RankedSeedGame, SeedGame } from "../types";
import {
  accessTone,
  createEmptyState,
  escapeHtml,
  formatAccessStatus,
  isBasicCatalogGame,
  MODERATE_FRICTION_THRESHOLD,
} from "../ui/helpers";
import { getDecisionLabel, getDecisionTone, renderCoverArt, renderStatusBadge } from "../ui/render";
import type { AppContext } from "./context";

export function renderUpcoming(ctx: AppContext) {
  if (!ctx.state.user.profile) {
    return createEmptyState(
      "Finish setup first so Playfit can match upcoming releases to your taste.",
      "Open setup",
      "go-setup",
    );
  }

  const activeFilters = ctx.ui.upcomingPlatformFilters;
  const userOwnedPlatforms = new Set(
    ctx.state.user.onboarding.platforms
      .filter((entry) => ["available", "limited"].includes(entry.status))
      .map((entry) => entry.platformId),
  );

  const now = new Date();
  const currentYear = String(now.getFullYear());
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yyyy = tomorrow.getFullYear();
  const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const dd = String(tomorrow.getDate()).padStart(2, "0");
  const tomorrowStr = `${yyyy}-${mm}-${dd}`;

  const scoredGames = ctx.seedData.allGames
    .filter((game) => game.releaseState === "unreleased")
    .filter((game) => !isBasicCatalogGame(game))
    .filter((game) => {
      if (!game.sortDate || game.sortDate === "TBA") return true;
      return game.sortDate >= tomorrowStr;
    })
    .map((game) => scoreSeedGame(game, ctx.state, ctx.state.user.profile!, ctx.seedData.gamesById))
    .filter((entry) => ctx.state.user.gameStates[entry.game.gameId]?.status !== "abandoned");

  const filteredGames = scoredGames.filter((entry) => {
    if (activeFilters.size === 0) return true;
    if (entry.game.availablePlatformIds.length === 0) return true;
    return entry.game.availablePlatformIds.some((pId) => activeFilters.has(pId));
  });

  const isExactDate = (entry: RankedSeedGame) => {
    const label = entry.game.releaseLabel ?? "";
    return label !== "" && label !== "TBA" && !/^\d{4}$/.test(label);
  };

  const confirmed = filteredGames.filter(
    (entry) => isExactDate(entry) && entry.game.sortDate?.startsWith(currentYear),
  );
  confirmed.sort((left, right) =>
    (left.game.sortDate ?? "").localeCompare(right.game.sortDate ?? ""),
  );

  const expectedTba = filteredGames.filter(
    (entry) =>
      !isExactDate(entry) &&
      (entry.game.sortDate?.startsWith(currentYear) || entry.game.releaseLabel === currentYear),
  );
  expectedTba.sort((left, right) => right.affinityScore - left.affinityScore);

  const futureOrTba = filteredGames.filter((entry) => {
    const isConfirmedThisYear = isExactDate(entry) && entry.game.sortDate?.startsWith(currentYear);
    const isExpectedThisYear =
      !isExactDate(entry) &&
      (entry.game.sortDate?.startsWith(currentYear) || entry.game.releaseLabel === currentYear);
    return !isConfirmedThisYear && !isExpectedThisYear;
  });
  futureOrTba.sort((left, right) => {
    const dateLeft = left.game.sortDate ?? "";
    const dateRight = right.game.sortDate ?? "";
    if (dateLeft === "TBA" && dateRight !== "TBA") return 1;
    if (dateLeft !== "TBA" && dateRight === "TBA") return -1;
    return dateLeft.localeCompare(dateRight) || right.affinityScore - left.affinityScore;
  });

  const platformFiltersMarkup = ctx.seedData.platforms
    .map((p) => {
      const active = ctx.ui.upcomingPlatformFilters.has(p.platformId);
      const activeClass = active ? "is-active" : "is-inactive";

      return `
      <button
        type="button"
        class="product-justwatch-filter-button ${activeClass}"
        data-action="toggle-upcoming-platform"
        data-platform-id="${escapeHtml(p.platformId)}"
        aria-pressed="${active ? "true" : "false"}"
      >
        <span class="platform-filter-name">${escapeHtml(p.displayName)}</span>
      </button>
    `;
    })
    .join("");

  const filterActionsMarkup = `
    <div class="product-filter-actions">
      <button type="button" class="product-button product-button-ghost product-button-sm" data-action="show-all-upcoming-platforms">Show All</button>
      <button type="button" class="product-button product-button-ghost product-button-sm" data-action="reset-upcoming-platforms">My Platforms</button>
    </div>
  `;

  const filterContainer = `
    <div class="product-upcoming-filters-bar">
      <span class="product-filter-label">Filter by platform:</span>
      <div class="product-justwatch-filters">
        ${platformFiltersMarkup}
      </div>
      ${filterActionsMarkup}
    </div>
  `;

  const renderPlatformsMarkup = (game: SeedGame) => {
    if (game.availablePlatformNames.length === 0) {
      return `<span class="product-platform-pill product-platform-tba">TBA Platforms</span>`;
    }
    return game.availablePlatformIds
      .map((pId, idx) => {
        const name = game.availablePlatformNames[idx] || pId;
        const owned = userOwnedPlatforms.has(pId);
        const ownedClass = owned ? "is-owned" : "is-unowned";
        return `<span class="product-platform-pill ${ownedClass}">${escapeHtml(name)}</span>`;
      })
      .join(" ");
  };

  const renderTierList = (games: RankedSeedGame[], emptyMessage: string) => {
    if (games.length === 0) {
      return `<p class="product-upcoming-tier-empty">${escapeHtml(emptyMessage)}</p>`;
    }
    return games
      .map((entry) => {
        const tracked = ctx.state.user.gameStates[entry.game.gameId]?.inWishlist ?? false;
        const isHighFit =
          entry.affinityScore >= STRONG_FIT_THRESHOLD &&
          entry.riskScore <= MODERATE_FRICTION_THRESHOLD;
        const isRisky = entry.riskScore >= HIGH_FRICTION_THRESHOLD;

        let rowClass = "";
        if (isHighFit) rowClass = " product-radar-row-highfit";
        else if (isRisky) rowClass = " product-radar-row-risky";

        const dateLabel = entry.game.releaseLabel || entry.game.releaseYear || "TBA";

        return `
        <article class="product-radar-row${rowClass}">
          ${renderCoverArt(entry.game, "thumb")}
          <div class="product-radar-main">
            <div class="product-radar-title-line">
              <h3><button class="product-link-button" data-action="open-dossier" data-game-id="${escapeHtml(entry.game.gameId)}">${escapeHtml(entry.game.title)}</button></h3>
              <span class="product-radar-date">${escapeHtml(dateLabel)}</span>
            </div>
            <p class="product-meta">${escapeHtml(entry.game.series || entry.game.primaryGenre)}</p>
            <div class="product-radar-platforms">
              ${renderPlatformsMarkup(entry.game)}
            </div>
          </div>
          <div class="product-radar-signals">
            <div class="product-chip-list product-chip-list-tight">
              ${tracked ? renderStatusBadge("Watching", "accent") : ""}
              ${renderStatusBadge(formatAccessStatus(entry), accessTone(entry))}
              ${renderStatusBadge(getDecisionLabel(entry), getDecisionTone(entry))}
            </div>
          </div>
          <div class="product-radar-actions">
            ${
              tracked
                ? `<button class="product-button product-button-secondary product-button-sm" data-action="toggle-wishlist" data-game-id="${escapeHtml(entry.game.gameId)}">Watching</button>`
                : `<button class="product-button product-button-secondary product-button-sm" data-action="toggle-wishlist" data-game-id="${escapeHtml(entry.game.gameId)}">Watch</button>`
            }
            <button class="product-button product-button-ghost product-button-sm" data-action="open-dossier" data-game-id="${escapeHtml(entry.game.gameId)}">See why</button>
          </div>
        </article>
      `;
      })
      .join("");
  };

  return `
    <section class="product-page-stack product-upcoming-page">
      <section class="product-page-header">
        <div>
          <p class="product-eyebrow">Radar</p>
          <h2>Games to keep an eye on</h2>
          <p class="product-tagline">Track future releases and see which ones fit your taste.</p>
        </div>
      </section>

      ${filterContainer}

      <section class="product-panel product-radar-list-surface">
        <div class="product-upcoming-tier-section">
          <div class="product-section-header">
            <div>
              <p class="product-eyebrow">Confirmed releases</p>
              <h2>Confirmed Dates (${currentYear})</h2>
            </div>
          </div>
          <div class="product-radar-list">
            ${renderTierList(confirmed, `No confirmed releases in ${currentYear} match the selected platform filter.`)}
          </div>
        </div>

        <div class="product-upcoming-tier-section">
          <div class="product-section-header">
            <div>
              <p class="product-eyebrow">Expected releases</p>
              <h2>Expected in ${currentYear} (Dates TBA)</h2>
            </div>
          </div>
          <div class="product-radar-list">
            ${renderTierList(expectedTba, `No expected ${currentYear} releases match the selected platform filter.`)}
          </div>
        </div>

        <div class="product-upcoming-tier-section">
          <div class="product-section-header">
            <div>
              <p class="product-eyebrow">Further out</p>
              <h2>Future & TBA (${String(now.getFullYear() + 1)}+)</h2>
            </div>
          </div>
          <div class="product-radar-list">
            ${renderTierList(futureOrTba, "No future or TBA releases match the selected platform filter.")}
          </div>
        </div>
      </section>
    </section>
  `;
}
