import { findExactSeedGame, scoreSeedGame } from "../domain/recommendations";
import { createEmptyState, escapeHtml, isBasicCatalogGame } from "../ui/helpers";
import { renderGameResultRow } from "../ui/render";
import type { AppContext } from "./context";

export function renderFinder(ctx: AppContext) {
  if (!ctx.state.user.profile) {
    return createEmptyState(
      "Finish setup first so Playfit can match games to your taste.",
      "Open setup",
      "go-setup",
    );
  }

  const finderQuery = ctx.ui.finderQuery.trim();
  const exactMatch = finderQuery ? findExactSeedGame(ctx.seedData.allGames, finderQuery) : null;
  const hasOnlyNearbyMatches = Boolean(finderQuery && !exactMatch);
  const results = finderQuery
    ? ctx.searchGames(finderQuery)
    : [...ctx.seedData.allGames]
        .filter((game) => game.releaseState === "released")
        .filter((game) => !isBasicCatalogGame(game))
        .filter((game) => {
          const gs = ctx.state.user.gameStates[game.gameId];
          return !gs?.status && !gs?.inBacklog && !gs?.inWishlist;
        })
        .map((game) =>
          scoreSeedGame(game, ctx.state, ctx.state.user.profile!, ctx.seedData.gamesById),
        )
        .sort((a, b) => b.affinityScore - a.affinityScore)
        .slice(0, 12)
        .map((r) => r.game);
  const finderEmptyMessage = finderQuery
    ? "No results found. Try a different title or series name."
    : "Search for any game to inspect or add it.";

  return `
    <section class="product-page-stack product-finder-page">
      <div class="product-page-header product-finder-hero">
        <div>
          <p class="product-eyebrow">${finderQuery ? (hasOnlyNearbyMatches ? "Closest matches" : "Search results") : "New games to check"}</p>
          <h2>Check a game</h2>
          <p class="product-tagline">${
            finderQuery
              ? hasOnlyNearbyMatches
                ? "No exact match found. Pick a result only if it's the right game."
                : "Ranked by how well they fit your taste."
              : "Search any game, or browse strong matches that are not in My Games yet."
          }</p>
        </div>
        <label class="product-field">
          <span class="product-field-hint">Search by title, series, or genre</span>
          <input class="product-input" type="search" data-field="finder-query" value="${escapeHtml(ctx.ui.finderQuery)}" placeholder="Search a game…" aria-label="Search games">
        </label>
      </div>
      ${
        hasOnlyNearbyMatches
          ? `
        <section class="product-exact-warning">
          <strong>No exact match found</strong>
          <p class="product-note">These are nearby matches — open one only if it's the right game.</p>
        </section>
      `
          : ""
      }
      <div class="product-results-list product-results-list-premium">
        ${
          results.length > 0
            ? results
                .map((game) => {
                  const ranked = scoreSeedGame(
                    game,
                    ctx.state,
                    ctx.state.user.profile!,
                    ctx.seedData.gamesById,
                  );
                  return renderGameResultRow(game, ranked, false);
                })
                .join("")
            : createEmptyState(finderEmptyMessage)
        }
      </div>
    </section>
  `;
}
