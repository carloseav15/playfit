import type { GameRecord, ProfileRow, RecommendationRow } from "../../data/schema";
import { buildSummaryStats, topProfileSignals } from "../../domain/summaries";
import { renderChip } from "../components/chips";
import { renderSectionHead } from "../components/section-head";
import { escapeHtml, humanizeValue } from "../utils";

function renderSignalList(rows: ProfileRow[], tone: string, emptyMessage: string) {
  if (rows.length === 0) {
    return `<div class="empty-state compact">${escapeHtml(emptyMessage)}</div>`;
  }

  return rows
    .map(
      (row) => `
        <article class="signal-card">
          <div class="signal-topline">
            <h3>${humanizeValue(row.value)}</h3>
            ${renderChip(`weight ${row.weight}`, tone)}
          </div>
          <p>${escapeHtml(row.evidence)}</p>
        </article>
      `,
    )
    .join("");
}

export function renderSummarySection(
  records: GameRecord[],
  profile: ProfileRow[],
  recommendations: RecommendationRow[],
) {
  const stats = buildSummaryStats(records, profile, recommendations);
  const positiveSignals = topProfileSignals(profile, "likes", 4);
  const avoidSignals = topProfileSignals(profile, "avoid", 4);

  const cards = [
    {
      label: "Strong signals",
      value: stats.strongSignals,
      note: "Profile rules with weight 5 or higher.",
    },
    {
      label: "Known games",
      value: stats.totalGames,
      note: "Unified records across catalog, opinions, and recommendations.",
    },
    {
      label: "Completed",
      value: stats.completedGames,
      note: "Your strongest evidence base for future recommendations.",
    },
    {
      label: "Actionable now",
      value: stats.actionableGames,
      note: "Backlog, on hold, playing, or real interest not yet started.",
    },
    {
      label: "Watch outcomes",
      value: stats.youtubeOutcomes,
      note: "Cases where the concept held up better than the gameplay loop.",
    },
    {
      label: "Check-ins logged",
      value: stats.checkinsLogged,
      note: "Session signals strengthening future recommendations.",
    },
    {
      label: "Open recommendations",
      value: stats.openRecommendations,
      note: "Titles that still need real play feedback.",
    },
  ];

  return `
    <section
      id="summary-section"
      class="panel panel-wide section-theme section-theme-overview"
      aria-labelledby="summary-heading"
    >
      ${renderSectionHead({
        kicker: "Overview",
        title: "Your library at a glance",
        titleId: "summary-heading",
        description:
          "A snapshot of what the workspace knows about your taste, current queue, and recommendation evidence.",
        meta: [
          { label: `${stats.totalGames} known games` },
          { label: `${stats.completedGames} completed`, tone: "success" },
          { label: `${stats.openRecommendations} open recommendations`, tone: "warning" },
        ],
      })}
      <div class="summary-grid">
        ${cards
          .map(
            (card) => `
              <article class="summary-card">
                <p class="eyebrow">${escapeHtml(card.label)}</p>
                <p class="summary-value">${card.value}</p>
                <p class="summary-note">${escapeHtml(card.note)}</p>
              </article>
            `,
          )
          .join("")}
      </div>
      <div class="summary-columns">
        <section class="subpanel" aria-labelledby="positive-signals-heading">
          <div class="subpanel-header">
            <h3 id="positive-signals-heading">What Usually Lands</h3>
            ${renderChip("likes", "success")}
          </div>
          <div class="signal-grid">
            ${renderSignalList(positiveSignals, "success", "No standout positive signals yet.")}
          </div>
        </section>
        <section class="subpanel" aria-labelledby="avoid-signals-heading">
          <div class="subpanel-header">
            <h3 id="avoid-signals-heading">Recurring Risks</h3>
            ${renderChip("avoid", "danger")}
          </div>
          <div class="signal-grid">
            ${renderSignalList(avoidSignals, "danger", "No standout negative signals yet.")}
          </div>
        </section>
      </div>
    </section>
  `;
}
