import type { GameRecord } from "../../data/schema";
import { formatLongText } from "../utils";
import { renderCoverArt } from "./cover-art";
import {
  renderCatalogBlock,
  renderOpinionBlock,
  renderReasonBlock,
  renderRecommendationBlock,
  renderSessionBlock,
  renderTraitBlock,
} from "./game-analysis";
import { renderGameBadgeGroup } from "./meta";

function renderDossierCard(title: string, content: string) {
  return `
    <article class="dossier-card">
      <section class="detail-block">
        <h3>${title}</h3>
      </section>
      ${content}
    </article>
  `;
}

export function renderGameDossier(record: GameRecord | null) {
  if (!record) {
    return "";
  }

  return `
    <div class="dossier-modal" aria-hidden="false">
      <div class="dossier-backdrop" data-close-dossier="true"></div>
      <section
        class="dossier-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dossier-title"
        tabindex="-1"
        data-dossier-dialog="true"
      >
        <div class="dossier-chrome">
          <div>
            <p class="eyebrow">Game dossier</p>
          </div>
          <button
            class="ghost-button modal-close-button"
            type="button"
            data-close-dossier="true"
            aria-label="Close dossier"
          >
            Close
          </button>
        </div>

        <div class="dossier-hero">
          <div class="dossier-hero-media">
            ${renderCoverArt({
              title: record.title,
              coverPath: record.coverPath,
              className: "dossier-hero-poster",
              size: "poster",
              loading: "eager",
            })}
          </div>

          <div class="dossier-hero-copy">
            <h2 id="dossier-title">${record.title}</h2>
            <p class="dossier-summary">${formatLongText(record.decisionSummary)}</p>
            ${renderGameBadgeGroup(record, "lg")}
          </div>

          <article class="dossier-command-card">
            <p class="eyebrow">Suggested move</p>
            <h3>${formatLongText(record.recommendedAction)}</h3>
            
            ${
              ["playing", "on_hold"].includes(record.status)
                ? `
              <div class="nlp-checkin">
                <p class="eyebrow">Session check-in</p>
                <div class="nlp-terminal">
                  <p class="nlp-prompt">&gt; Ready to capture session signal</p>
                  <textarea
                    id="nlp-checkin-input"
                    class="nlp-input"
                    placeholder="e.g. Played 2 hours, hit a wall, mood is frustrated"
                    rows="3"
                  ></textarea>
                  <button
                    class="primary-button nlp-submit"
                    type="button"
                    data-submit-checkin="true"
                  >
                    Log check-in
                  </button>
                </div>
              </div>
            `
                : ""
            }
          </article>

        </div>

        <div class="dossier-grid">
          ${renderDossierCard(
            "Why the model likes it",
            `
              ${renderReasonBlock("Positive fit", record.profileMatchReasons, "success")}
              ${renderReasonBlock("Backlog reasons", record.backlogPriorityReasons)}
            `,
          )}

          ${renderDossierCard(
            "What could go wrong",
            `
              ${renderReasonBlock("Watch risk", record.watchRiskReasons, "warning")}
              ${renderReasonBlock("Trap risk", record.trapRiskReasons, "danger")}
            `,
          )}

          ${renderDossierCard(
            "Evidence trail",
            `
              ${renderTraitBlock(record)}
              ${renderCatalogBlock(record)}
              ${renderOpinionBlock(record)}
              ${renderSessionBlock(record)}
              ${renderRecommendationBlock(record)}
            `,
          )}
        </div>
        <div class="dossier-scroll-hint" aria-hidden="true"></div>
      </section>
    </div>
  `;
}
