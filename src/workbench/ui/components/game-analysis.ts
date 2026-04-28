import type { GameRecord } from "../../data/schema";
import { renderChip } from "./chips";
import { escapeHtml, formatDate, formatLongText, humanizeValue } from "../utils";

export function renderReasonBlock(title: string, reasons: string[], tone = "neutral") {
  if (reasons.length === 0) {
    return "";
  }

  return `
    <section class="detail-block">
      <h4>${escapeHtml(title)}</h4>
      <div class="inline-chip-list">
        ${reasons.map((reason) => renderChip(reason, tone)).join("")}
      </div>
    </section>
  `;
}

export function renderTraitBlock(record: GameRecord) {
  if (record.matchedTraits.length === 0) {
    return "";
  }

  return `
    <section class="detail-block">
      <h4>Connected traits</h4>
      <div class="inline-chip-list">
        ${record.matchedTraits.map((trait) => renderChip(trait)).join("")}
      </div>
    </section>
  `;
}

export function renderCatalogBlock(record: GameRecord) {
  return `
    <section class="detail-block">
      <h4>Catalog note</h4>
      <p>${formatLongText(record.catalogNotes)}</p>
    </section>
  `;
}

export function renderOpinionBlock(record: GameRecord) {
  if (!record.opinion) {
    return "";
  }

  const { opinion } = record;
  const structuredFields = [
    opinion.completion_mode ? renderChip(`Completion: ${opinion.completion_mode}`) : "",
    opinion.difficulty_mode ? renderChip(`Difficulty: ${opinion.difficulty_mode}`) : "",
    opinion.cheats_used ? renderChip(`Cheats: ${opinion.cheats_used}`, "warning") : "",
    opinion.purchase_interest ? renderChip(`Buy intent: ${opinion.purchase_interest}`) : "",
    opinion.price_ceiling_usd ? renderChip(`Max price: $${opinion.price_ceiling_usd}`, "success") : "",
    opinion.drop_reason_tags ? renderChip(`Drop reason: ${opinion.drop_reason_tags}`, "danger") : ""
  ].filter(Boolean);

  return `
    <section class="detail-block">
      <h4>Your opinion</h4>
      ${structuredFields.length > 0 ? `<div class="inline-chip-list mb-2">${structuredFields.join("")}</div>` : ""}
      <p>${formatLongText(opinion.notes)}</p>
      <p class="meta-line">Last updated: ${formatDate(opinion.last_updated)}</p>
    </section>
  `;
}

export function renderRecommendationBlock(record: GameRecord) {
  if (!record.recommendation) {
    return "";
  }

  return `
    <section class="detail-block">
      <h4>Recommendation log</h4>
      <p>${formatLongText(record.recommendation.reason)}</p>
      ${
        record.recommendation.user_feedback
          ? `<p><strong>Feedback:</strong> ${formatLongText(record.recommendation.user_feedback)}</p>`
          : ""
      }
      ${
        record.recommendation.next_action
          ? `<p><strong>Next step:</strong> ${formatLongText(record.recommendation.next_action)}</p>`
          : ""
      }
    </section>
  `;
}

export function renderSessionBlock(record: GameRecord) {
  if (!record.latestCheckin) {
    return "";
  }

  return `
    <section class="detail-block">
      <h4>Session memory</h4>
      <div class="inline-chip-list">
        ${record.currentMood ? renderChip(`Mood ${humanizeValue(record.currentMood)}`) : ""}
        ${record.currentMomentum ? renderChip(`Momentum ${humanizeValue(record.currentMomentum)}`, "success") : ""}
        ${record.currentFriction ? renderChip(`Friction ${humanizeValue(record.currentFriction)}`, record.currentFriction === "high" ? "danger" : "warning") : ""}
        ${record.currentSessionOutcome ? renderChip(humanizeValue(record.currentSessionOutcome)) : ""}
        ${record.currentReturnIntent ? renderChip(`Return ${humanizeValue(record.currentReturnIntent)}`) : ""}
        ${record.currentGuideUsage ? renderChip(`Guide ${humanizeValue(record.currentGuideUsage)}`) : ""}
      </div>
      <p>${formatLongText(record.latestCheckin.notes)}</p>
      <p class="meta-line">Latest check-in: ${formatDate(record.latestCheckin.checkin_date)}</p>
      ${
        record.checkins.length > 1
          ? `
            <div class="session-timeline">
              ${record.checkins
                .slice(0, 3)
                .map(
                  (checkin) => `
                    <div class="session-timeline-item">
                      <strong>${formatDate(checkin.checkin_date)}</strong>
                      <span>${humanizeValue(checkin.session_outcome || "session_logged")}</span>
                    </div>
                  `,
                )
                .join("")}
            </div>
          `
          : ""
      }
    </section>
  `;
}
