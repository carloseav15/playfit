export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function humanizeValue(value: string) {
  if (!value) {
    return "-";
  }

  return escapeHtml(
    value
      .replaceAll("_", " ")
      .replace(/\b\w/g, (character) => character.toUpperCase()),
  );
}

export function formatDate(value: string) {
  if (!value) {
    return "-";
  }

  return escapeHtml(value);
}

export function formatLongText(value: string) {
  if (!value) {
    return "-";
  }

  return escapeHtml(value);
}

export function scoreBand(value: number) {
  if (value >= 80) {
    return "score-5";
  }
  if (value >= 60) {
    return "score-4";
  }
  if (value >= 40) {
    return "score-3";
  }
  if (value >= 20) {
    return "score-2";
  }
  return "score-1";
}

export function formatStatusLabel(value: string) {
  const labels: Record<string, string> = {
    interested_not_started: "Interested",
    backlog: "Backlog",
    playing: "Playing",
    on_hold: "On hold",
    completed: "Completed",
    completed_or_watched: "Played or watched",
    dropped_then_watched: "Dropped then watched",
    dropped: "Dropped",
    bounced: "Bounced",
    open: "Open",
    catalog_only: "Catalog only",
  };

  return labels[value] ?? humanizeValue(value);
}
