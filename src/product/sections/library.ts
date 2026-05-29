import { createEmptyState, escapeHtml, formatPlayStatus, playStatusTone } from "../ui/helpers";
import { renderCoverArt, renderStars, renderStatusBadge } from "../ui/render";
import type { AppContext } from "./context";

export function renderLibrary(ctx: AppContext) {
  const allGameStates = Object.entries(ctx.state.user.gameStates);
  const query = ctx.ui.libraryQuery.trim().toLowerCase();

  const filteredStates = query
    ? allGameStates.filter(([gameId]) => {
        const game = ctx.seedData.gamesById.get(gameId);
        if (!game) return false;
        return (
          game.title.toLowerCase().includes(query) ||
          (game.series && game.series.toLowerCase().includes(query)) ||
          (game.primaryGenre && game.primaryGenre.toLowerCase().includes(query))
        );
      })
    : allGameStates;

  const sections: Array<{
    heading: string;
    filter: (gs: { status?: string; inBacklog: boolean; inWishlist: boolean }) => boolean;
  }> = [
    { heading: "Playing now", filter: (gs) => gs.status === "playing" },
    { heading: "Backlog", filter: (gs) => gs.inBacklog && !gs.status && !gs.inWishlist },
    { heading: "Wishlist", filter: (gs) => gs.inWishlist && !gs.status },
    { heading: "Paused", filter: (gs) => gs.status === "on_hold" || gs.status === "shelved" },
    { heading: "Beaten", filter: (gs) => gs.status === "beaten" },
    { heading: "Completed", filter: (gs) => gs.status === "completed" },
    { heading: "Abandoned", filter: (gs) => gs.status === "abandoned" },
    { heading: "All games", filter: (gs) => !gs.status && !gs.inBacklog && !gs.inWishlist },
  ];

  const totalLogged = allGameStates.filter(
    ([, gs]) => gs.status != null || gs.inBacklog || gs.inWishlist,
  ).length;

  const sectionsHtml = sections
    .map(({ heading, filter }) => {
      const entries = filteredStates.filter(([, gs]) => filter(gs));
      if (entries.length === 0) return "";

      const rows = entries
        .map(([gameId, gs]) => {
          const game = ctx.seedData.gamesById.get(gameId);
          if (!game) return "";
          return `
            <li class="product-library-row">
              ${renderCoverArt(game, "thumb")}
              <div class="product-library-main">
                <div class="product-library-info">
                  <span class="product-library-title">${escapeHtml(game.title)}</span>
                  <span class="product-meta">${escapeHtml(game.series || game.primaryGenre)}</span>
                  ${gs.status ? renderStatusBadge(formatPlayStatus(gs.status), playStatusTone(gs.status)) : ""}
                  ${gs.inBacklog ? renderStatusBadge("Backlog", "neutral") : ""}
                  ${gs.inWishlist ? renderStatusBadge("Wishlist", "accent") : ""}
                  ${gs.storyCompleted ? renderStatusBadge("Story completed", "accent") : ""}
                </div>
                <div class="product-library-rating">
                  ${renderStars(gs.rating, gameId, false)}
                </div>
              </div>
              <div class="product-library-toggles">
                <button type="button" class="product-button product-button-ghost product-button-sm" data-action="open-dossier" data-game-id="${escapeHtml(gameId)}">View</button>
              </div>
            </li>
          `;
        })
        .join("");

      return `
        <section class="product-library-section">
          <h3 class="product-library-heading">${escapeHtml(heading)} <span class="product-meta">(${entries.length})</span></h3>
          <ul class="product-library-list">${rows}</ul>
        </section>
      `;
    })
    .join("");

  return `
    <section class="product-page-stack">
      <section class="product-card product-library">
        <div class="product-page-header product-page-header-row">
          <div>
            <p class="product-eyebrow">My Games</p>
            <h2>Your games</h2>
            ${totalLogged > 0 ? `<p class="product-note">${totalLogged} game${totalLogged !== 1 ? "s" : ""} saved.</p>` : ""}
          </div>
        </div>
        <label class="product-field">
          <span class="product-field-hint">Filter by title, series, or genre</span>
          <input class="product-input" type="search" data-field="library-query" value="${escapeHtml(ctx.ui.libraryQuery)}" placeholder="Search your games…" aria-label="Search your games">
        </label>
        ${sectionsHtml || createEmptyState(query ? "No games match your search." : "No games yet. Add one and picks will get sharper right away.", query ? undefined : "Go to Today", query ? undefined : "go-today")}
      </section>
    </section>
  `;
}
