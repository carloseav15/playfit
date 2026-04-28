import { renderChip } from "./chips";
import { escapeHtml } from "../utils";

interface SectionHeadOptions {
  kicker: string;
  title: string;
  titleId?: string;
  description: string;
  meta?: Array<{ label: string; tone?: string }>;
}

export function renderSectionHead({
  kicker,
  title,
  titleId,
  description,
  meta = [],
}: SectionHeadOptions) {
  return `
    <div class="section-head">
      <div class="section-head-copy">
        <p class="eyebrow">${escapeHtml(kicker)}</p>
        <h2 ${titleId ? `id="${escapeHtml(titleId)}"` : ""}>${escapeHtml(title)}</h2>
        <p class="section-description">${escapeHtml(description)}</p>
      </div>
      ${
        meta.length > 0
          ? `
            <div class="section-meta-row">
              ${meta
                .map((item) => renderChip(item.label, item.tone ?? "neutral"))
                .join("")}
            </div>
          `
          : ""
      }
    </div>
  `;
}
