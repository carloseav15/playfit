import type { CollectionRail } from "../../data/schema";
import { renderCoverCard } from "./cover-card";
import { renderInlineSpotlight } from "./inline-spotlight";
import { escapeHtml } from "../utils";

interface ContentRailOptions {
  rail: CollectionRail;
  selectedItemKey: string | null;
}

export function renderContentRail({
  rail,
  selectedItemKey,
}: ContentRailOptions) {
  const selectedItem =
    rail.items.find((item) => item.key === selectedItemKey) ?? null;

  return `
    <section class="content-rail" aria-labelledby="rail-${escapeHtml(rail.id)}-title">
      <header class="content-rail-header">
        <div>
          <h3 id="rail-${escapeHtml(rail.id)}-title">${escapeHtml(rail.title)}</h3>
          <p class="section-description">${escapeHtml(rail.description)}</p>
        </div>
        <div class="rail-controls">
          <button
            class="ghost-button rail-button"
            type="button"
            data-rail-scroll="prev"
            data-rail-id="${escapeHtml(rail.id)}"
            aria-label="Scroll ${escapeHtml(rail.title)} left"
          >
            Prev
          </button>
          <button
            class="ghost-button rail-button"
            type="button"
            data-rail-scroll="next"
            data-rail-id="${escapeHtml(rail.id)}"
            aria-label="Scroll ${escapeHtml(rail.title)} right"
          >
            Next
          </button>
        </div>
      </header>

      <div
        class="content-rail-track"
        data-rail-track="true"
        data-rail-id="${escapeHtml(rail.id)}"
        tabindex="0"
        aria-label="${escapeHtml(rail.title)}"
      >
        ${rail.items
          .map((item) => renderCoverCard(item, item.key === selectedItemKey))
          .join("")}
      </div>

      ${renderInlineSpotlight(selectedItem)}
    </section>
  `;
}
