import { escapeHtml, formatStatusLabel, scoreBand } from "../utils";

function statusTone(status: string) {
  if (["completed", "playing"].includes(status)) return "success";
  if (["on_hold", "backlog", "interested_not_started", "open", "completed_or_watched"].includes(status)) return "warning";
  if (["dropped", "dropped_then_watched", "bounced"].includes(status)) return "danger";
  return "neutral";
}

export function renderChip(label: string, tone = "neutral") {
  return `<span class="chip ${tone}">${escapeHtml(label)}</span>`;
}

export function renderStatusPill(status: string) {
  if (!status) return `<span class="status-pill neutral">-</span>`;
  return `<span class="status-pill ${statusTone(status)}">${formatStatusLabel(status)}</span>`;
}

export function renderFivePointScore(value?: number, prefix = "") {
  if (value === undefined) return `<span class="score-pill neutral">-</span>`;
  const label = prefix ? `${prefix} ${value}` : String(value);
  const intensity = (value / 5) * 100;
  
  return `
    <span class="score-pill score-${value}" style="--intensity: ${intensity}%">
      <span>${escapeHtml(label)}</span>
    </span>`;
}

export function renderHundredPointScore(value: number, label: string) {
  const band = scoreBand(value);
  return `
    <span class="score-pill ${band}" style="--intensity: ${value}%">
      <span>${escapeHtml(label)} ${value}</span>
    </span>`;
}
