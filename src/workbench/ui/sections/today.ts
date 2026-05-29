import type { GameRecord } from "../../data/schema";
import type { TodayDecisionModel } from "../../domain/today";
import { renderCoverArt } from "../components/cover-art";
import { renderEmptyState } from "../components/empty-state";
import { renderActionRow, renderGameBadgeGroup } from "../components/meta";
import { escapeHtml } from "../utils";

function renderSupportCard(
  label: string,
  description: string,
  record: GameRecord | null,
  emptyMessage: string,
  tone: "default" | "caution" = "default",
) {
  if (!record) {
    return `
      <article class="today-support-card empty">
        <p class="eyebrow">${escapeHtml(label)}</p>
        <h3>${escapeHtml(description)}</h3>
        ${renderEmptyState(emptyMessage)}
      </article>
    `;
  }

  return `
    <article class="today-support-card ${tone === "caution" ? "caution" : ""}">
      <div class="today-support-cover">
        ${renderCoverArt({
          title: record.title,
          coverPath: record.coverPath,
          size: "mini",
          className: "today-support-poster",
        })}
      </div>

      <div class="today-support-stack">
        <p class="eyebrow">${escapeHtml(label)}</p>
        <h3>${escapeHtml(record.title)}</h3>
        ${renderGameBadgeGroup(record, "sm")}
        <p class="summary-note">${escapeHtml(record.decisionSummary)}</p>
        <p class="today-support-note">${escapeHtml(record.recommendedAction)}</p>
      </div>
      ${renderActionRow(
        [
          {
            label: "Open dossier",
            actionId: record.gameId,
            variant: tone === "caution" ? "ghost" : "subtle",
          },
        ],
        "card-actions card-actions--support",
      )}
    </article>
  `;
}

export function renderTodaySection(
  model: TodayDecisionModel,
  energyLevel: "high" | "low" | "normal" = "normal",
) {
  const currentRun = model.currentRun;
  const heroRecord = currentRun ?? model.nextUp;
  const hasCurrentRun = Boolean(currentRun);
  const supportCards = [
    hasCurrentRun
      ? renderSupportCard(
          "Next up",
          "The strongest fresh recommendation once you finish or pause the active run.",
          model.nextUp,
          "No strong fresh pick stands out right now.",
        )
      : "",
    renderSupportCard(
      "Best resume",
      hasCurrentRun
        ? "Paused games worth resuming without replacing the current run."
        : "Paused games that still look worth another run.",
      model.resume,
      "No paused game rises above the rest right now.",
    ),
    renderSupportCard(
      "Avoid for now",
      "Interesting in theory, but high-friction in your current context.",
      model.avoid,
      "No major caution case is dominating the queue right now.",
      "caution",
    ),
  ]
    .filter(Boolean)
    .join("");

  if (!heroRecord && !supportCards) {
    return `
      <section class="panel panel-wide section-theme-today zen-stage">
        <div class="zen-empty">
          <h2>Board cleared.</h2>
          <p>No actionable games left based on current filters and context.</p>
          <button class="ghost-button" type="button" data-reset-session="true">Reset session</button>
        </div>
      </section>
    `;
  }

  if (!heroRecord) {
    return `
      <section class="panel panel-wide section-theme-today zen-stage">
        <div class="today-stage-head">
          <p class="eyebrow">Decision board</p>
          <p class="section-description">
            No fresh recommendation is leading right now. Your resume and caution lanes are still available.
          </p>
        </div>

        <div class="zen-frame today-decision-frame">
          <div class="zen-empty">
            <h2>No fresh pick is leading the queue.</h2>
            <p>Use the resume lane if you want something familiar, or clear ignored picks to reopen the queue.</p>
            <button class="ghost-button" type="button" data-reset-session="true">Reset session</button>
          </div>
        </div>

        <div class="today-support-grid">
          ${supportCards}
        </div>
      </section>
    `;
  }

  const questionContext = hasCurrentRun ? "Continue your active run" : "Best next pick";
  const stageDescription = hasCurrentRun
    ? "Your active run stays pinned while one fresh recommendation, one resume lane, and one caution lane stay visible."
    : "One fresh recommendation, one resume lane, and one caution lane.";
  const heroActionText = hasCurrentRun
    ? heroRecord.recommendedAction || "Keep going. Momentum is already established."
    : heroRecord.recommendedAction || "A highly rated game fitting your current energy context.";

  return `
    <section class="panel panel-wide section-theme-today zen-stage">
      <div class="today-stage-head">
        <p class="eyebrow">Decision board</p>
        <p class="section-description">
          ${escapeHtml(stageDescription)}
        </p>
      </div>

      <div class="zen-frame today-decision-frame">
        <div class="zen-feature">
          <div class="zen-cover">
            ${renderCoverArt({
              title: heroRecord.title,
              coverPath: heroRecord.coverPath,
              size: "poster",
              className: "zen-poster",
              loading: "eager",
            })}
          </div>

          <div class="zen-copy">
            <p class="eyebrow">
              ${questionContext}
            </p>

            <h1 class="zen-title">
              ${escapeHtml(heroRecord.title)}${hasCurrentRun ? "" : "?"}
            </h1>

            <div class="zen-meta">
              ${renderGameBadgeGroup(heroRecord, "md")}
            </div>

            <p class="zen-action-text">
              ${escapeHtml(heroActionText)}
            </p>
          </div>
        </div>

        ${renderActionRow(
          hasCurrentRun
            ? [
                {
                  label: "Continue active run",
                  actionId: heroRecord.gameId,
                  variant: "primary",
                },
              ]
            : [
                {
                  label: "No, next option",
                  variant: "ghost",
                  attributes: `id="zen-pass-button" data-game-id="${escapeHtml(heroRecord.gameId)}"`,
                },
                {
                  label: "Yes, let's play",
                  actionId: heroRecord.gameId,
                  variant: "primary",
                },
              ],
          "zen-controls card-actions card-actions--stack-mobile",
        )}
      </div>

      <div class="today-support-grid">
        ${supportCards}
      </div>

      ${
        energyLevel === "low"
          ? `
            <div class="zen-context-banner is-low-energy">
              <span class="zen-context-icon">🪫</span> Low Battery active — prioritizing fast-paced, low-friction sessions.
            </div>
          `
          : ""
      }

      ${
        energyLevel === "high"
          ? `
            <div class="zen-context-banner is-high-energy">
              <span class="zen-context-icon">⚡️</span> High Energy active — deep mechanics and long arcs pushed forward.
            </div>
          `
          : ""
      }
    </section>
  `;
}
