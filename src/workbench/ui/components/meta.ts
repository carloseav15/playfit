import type { GameRecord } from "../../data/schema";
import {
  renderFivePointScore,
  renderHundredPointScore,
  renderStatusPill,
} from "./chips";
import { escapeHtml } from "../utils";

export type BadgeGroupSize = "sm" | "md" | "lg";
export type ActionButtonVariant = "primary" | "ghost" | "subtle";
export type ActionButtonSize = "sm" | "md" | "lg";

export interface ActionButtonConfig {
  label: string;
  actionId?: string;
  variant?: ActionButtonVariant;
  size?: ActionButtonSize;
  iconMarkup?: string;
  attributes?: string;
}

export function renderGameBadgeGroup(
  record: GameRecord,
  size: BadgeGroupSize = "md"
) {
  const containerClass = `badge-group badge-group--${size}`;

  return `
    <div class="${containerClass}">
      ${renderStatusPill(record.status)}
      ${
        record.fitEstimate !== undefined
          ? renderFivePointScore(record.fitEstimate, "fit")
          : renderHundredPointScore(record.profileMatchScore, "match")
      }
      ${renderHundredPointScore(record.backlogPriorityScore, "priority")}
      ${
        size !== "sm"
          ? `
            ${renderHundredPointScore(record.watchRiskScore, "watch")}
            ${renderHundredPointScore(record.trapRiskScore, "trap")}
          `
          : ""
      }
    </div>
  `;
}

export function renderActionBtn({
  label,
  actionId,
  variant = "primary",
  size = "md",
  iconMarkup = "",
  attributes = "",
}: ActionButtonConfig) {
  const attr = [
    actionId
      ? `data-open-dossier="${escapeHtml(actionId)}" aria-haspopup="dialog"`
      : "",
    attributes,
  ]
    .filter(Boolean)
    .join(" ");
  const className = `${variant}-button ${size !== "md" ? `btn--${size}` : ""}`;

  return `
    <button class="${className}" type="button" ${attr}>
      ${iconMarkup}
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

export function renderActionRow(
  actions: ActionButtonConfig[],
  className = "card-actions",
) {
  if (actions.length === 0) {
    return "";
  }

  return `
    <div class="${className}">
      ${actions.map((action) => renderActionBtn(action)).join("")}
    </div>
  `;
}
