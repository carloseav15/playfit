import type { CollectionRailItem } from "../../data/schema";
import { renderCoverArt } from "./cover-art";
import { escapeHtml } from "../utils";

export function renderCoverCard(item: CollectionRailItem, selected: boolean) {
  return `
    <button
      class="cover-card ${selected ? "is-selected" : ""}"
      type="button"
      title="${escapeHtml(item.title)}"
      data-select-collection-item="${escapeHtml(item.key)}"
      data-rail-id="${escapeHtml(item.railId)}"
      aria-pressed="${selected}"
      aria-controls="collection-spotlight"
    >
      <div class="cover-card-media">
        ${renderCoverArt({
          title: item.title,
          coverPath: item.coverPath,
          className: "cover-card-poster",
          size: "poster",
        })}
      </div>
      <div class="cover-card-copy">
        <span class="cover-card-title">${escapeHtml(item.title)}</span>
      </div>
    </button>
  `;
}
