import { scoreSeedGame } from "../domain/recommendations";
import { createEmptyState, escapeHtml, summarizeRankedGame } from "../ui/helpers";
import { renderGameDossier, renderInlineGameActions } from "../ui/render";
import type { AppContext } from "./context";

export function renderDossierScreen(ctx: AppContext, gameId: string) {
  const profile = ctx.state.user.profile;
  const game = ctx.getSeedGame(gameId);

  if (!profile || !game) {
    return `
      <div class="product-modal" role="dialog" aria-modal="true" aria-label="Game details">
        <div class="product-modal-head">
          <span class="product-modal-title">Game details</span>
          <button class="product-modal-close" data-action="close-dossier" aria-label="Close">✕</button>
        </div>
        <div class="product-modal-body">
          ${createEmptyState("Could not open this game.")}
        </div>
      </div>
    `;
  }

  const ranked = scoreSeedGame(game, ctx.state, profile, ctx.seedData.gamesById);
  const gameState = ctx.state.user.gameStates[gameId] ?? { inBacklog: false, inWishlist: false };
  const dossierMeta = `Platforms: ${ranked.game.availablePlatformNames.join(", ") || "Unknown"}${ranked.game.releaseYear ? ` · ${ranked.game.releaseYear}` : ""}${ranked.game.sourceRef ? ` · ${ranked.game.sourceRef}` : ""}`;

  return `
    <div class="product-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(game.title)}">
      <div class="product-modal-head">
        <span class="product-modal-title">${escapeHtml(game.title)}</span>
        <button class="product-modal-close" data-action="close-dossier" aria-label="Close">✕</button>
      </div>
      <div class="product-modal-body">
        ${renderGameDossier("Why this pick", ranked, {
          summary: summarizeRankedGame(ranked),
          detailMeta: dossierMeta,
          extraContent: renderInlineGameActions(
            gameId,
            {
              ...gameState,
              rating: ranked.game.scoringStatus === "basic" ? undefined : gameState.rating,
            },
            ranked.game.releaseState === "released",
          ),
        })}
      </div>
    </div>
  `;
}
