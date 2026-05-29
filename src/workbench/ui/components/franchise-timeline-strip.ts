import type { FranchiseCollection, FranchiseEntryRecord } from "../../data/schema";
import { escapeHtml, humanizeValue } from "../utils";
import { renderChip } from "./chips";

function timelineTone(entry: FranchiseEntryRecord) {
  if (entry.userBucket === "played") return "success";
  if (entry.userBucket === "caution") return "danger";
  if (entry.userBucket === "resume" || ["playing", "on_hold"].includes(entry.userStatus)) {
    return "warning";
  }
  if (entry.lifecycleStatus === "upcoming") return "neutral";
  return "neutral";
}

function timelineBadge(entry: FranchiseEntryRecord) {
  if (entry.userStatus) {
    return humanizeValue(entry.userStatus);
  }

  if (entry.lifecycleStatus === "upcoming") {
    return "Upcoming";
  }

  return humanizeValue(entry.entryType);
}

export function renderFranchiseTimelineStrip(collection: FranchiseCollection) {
  return `
    <div class="timeline-strip" role="list" aria-label="${escapeHtml(collection.series)} chronology">
      ${collection.entries
        .map(
          (entry) => `
            <article class="timeline-entry" role="listitem">
              <span class="timeline-year">${escapeHtml(entry.releaseYear || "TBD")}</span>
              <strong>${escapeHtml(entry.title)}</strong>
              ${renderChip(timelineBadge(entry), timelineTone(entry))}
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}
