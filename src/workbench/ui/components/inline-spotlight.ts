import type { CollectionRailItem } from "../../data/schema";
import { escapeHtml, humanizeValue } from "../utils";
import { renderStatusPill } from "./chips";
import { renderCoverArt } from "./cover-art";
import { renderFranchiseTimelineStrip } from "./franchise-timeline-strip";
import { renderActionRow, renderGameBadgeGroup } from "./meta";

function renderGameSpotlight(item: CollectionRailItem) {
  const record = item.record;

  if (!record) {
    return "";
  }

  return `
    <div class="spotlight-copy">
      <p class="eyebrow">Game spotlight</p>
      <h3 id="collection-spotlight-title" tabindex="-1">${escapeHtml(record.title)}</h3>
      ${renderGameBadgeGroup(record)}
      <p class="spotlight-summary">${escapeHtml(record.decisionSummary)}</p>
      <p class="spotlight-detail">${escapeHtml(record.recommendedAction)}</p>
      ${renderActionRow(
        [
          {
            label: "Open dossier",
            actionId: record.gameId,
          },
        ],
        "card-actions card-actions--inline",
      )}
    </div>
  `;
}

function renderFranchiseSpotlight(item: CollectionRailItem) {
  const collection = item.collection;

  if (!collection) {
    return "";
  }

  const nextStep = collection.nextEntry?.title || "No clear next step yet";
  const currentStep = collection.currentEntry?.title || "No active run";

  return `
    <div class="spotlight-copy">
      <p class="eyebrow">Franchise spotlight</p>
      <h3 id="collection-spotlight-title" tabindex="-1">${escapeHtml(collection.series)}</h3>
      <div class="spotlight-meta-row">
        <span class="score-pill score-5"><span>${escapeHtml(`${collection.progressPercent}% tracked`)}</span></span>
        <span class="score-pill score-4"><span>${escapeHtml(`${collection.affinityScore} affinity`)}</span></span>
      </div>
      <p class="spotlight-summary">${escapeHtml(item.detail)}</p>
      <dl class="spotlight-definition-list">
        <div>
          <dt>Current step</dt>
          <dd>${escapeHtml(currentStep)}</dd>
        </div>
        <div>
          <dt>Next step</dt>
          <dd>${escapeHtml(nextStep)}</dd>
        </div>
      </dl>
      ${renderFranchiseTimelineStrip(collection)}
    </div>
  `;
}

function renderEntrySpotlight(item: CollectionRailItem) {
  const entry = item.entry;
  const collection = item.collection;

  if (!entry || !collection) {
    return "";
  }

  return `
    <div class="spotlight-copy">
      <p class="eyebrow">Franchise step</p>
      <h3 id="collection-spotlight-title" tabindex="-1">${escapeHtml(entry.title)}</h3>
      <div class="spotlight-meta-row">
        ${entry.userStatus ? renderStatusPill(entry.userStatus) : ""}
        <span class="chip">${escapeHtml(entry.releaseYear || "TBD")}</span>
        <span class="chip">${escapeHtml(humanizeValue(entry.entryType))}</span>
      </div>
      <p class="spotlight-summary">${escapeHtml(item.detail)}</p>
      <dl class="spotlight-definition-list">
        <div>
          <dt>Series</dt>
          <dd>${escapeHtml(collection.series)}</dd>
        </div>
        <div>
          <dt>Chronology</dt>
          <dd>${escapeHtml(`#${entry.releaseOrder}`)}</dd>
        </div>
        <div>
          <dt>Lifecycle</dt>
          <dd>${escapeHtml(humanizeValue(entry.lifecycleStatus))}</dd>
        </div>
      </dl>
      ${
        entry.gameRecord
          ? renderActionRow(
              [
                {
                  label: "Open dossier",
                  actionId: entry.gameRecord.gameId,
                },
              ],
              "card-actions card-actions--inline",
            )
          : ""
      }
      ${renderFranchiseTimelineStrip(collection)}
    </div>
  `;
}

export function renderInlineSpotlight(item: CollectionRailItem | null) {
  if (!item) {
    return "";
  }

  return `
    <section
      id="collection-spotlight"
      class="inline-spotlight"
      aria-live="polite"
      aria-labelledby="collection-spotlight-title"
    >
      <div class="inline-spotlight-media">
        ${renderCoverArt({
          title: item.title,
          coverPath: item.coverPath,
          className: "inline-spotlight-poster",
          size: "poster",
          loading: "eager",
        })}
      </div>
      ${
        item.kind === "franchise"
          ? renderFranchiseSpotlight(item)
          : item.kind === "franchise_entry"
            ? renderEntrySpotlight(item)
            : renderGameSpotlight(item)
      }
    </section>
  `;
}
