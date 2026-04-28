import { escapeHtml } from "../utils";

export function renderEmptyState(message: string) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}
