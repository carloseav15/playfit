import type { GameRecord } from "../../data/schema";
import type { LibraryFilters } from "../../domain/filters";
import {
  renderChip,
  renderFivePointScore,
  renderHundredPointScore,
  renderStatusPill,
} from "../components/chips";
import { renderCoverArt } from "../components/cover-art";
import { renderSectionHead } from "../components/section-head";
import { renderTable } from "../components/table";
import { escapeHtml, humanizeValue } from "../utils";

interface LibrarySectionProps {
  records: GameRecord[];
  totalRecords: number;
  filters: LibraryFilters;
  statuses: string[];
  genres: string[];
  visibleRecords: number;
  currentPage: number;
  totalPages: number;
}

function renderOptions(values: string[], selectedValue: string, allLabel: string) {
  return `
    <option value="all">${escapeHtml(allLabel)}</option>
    ${values
      .map(
        (value) => `
          <option value="${escapeHtml(value)}" ${
            selectedValue === value ? "selected" : ""
          }>
            ${humanizeValue(value)}
          </option>
        `,
      )
      .join("")}
  `;
}

function renderTraitList(traits: string[]) {
  if (traits.length === 0) {
    return "-";
  }

  return `
    <div class="inline-chip-list">
      ${traits.map((trait) => renderChip(trait)).join("")}
    </div>
  `;
}

export function renderLibrarySection({
  records,
  totalRecords,
  visibleRecords,
  filters,
  statuses,
  genres,
  currentPage,
  totalPages,
}: LibrarySectionProps) {
  const columns = [
    {
      header: "Game",
      className: "col-title",
      render: (record: GameRecord) => `
        <div class="table-title table-title-with-cover">
          ${renderCoverArt({
            title: record.title,
            coverPath: record.coverPath,
            className: "table-cover-thumb",
            size: "thumb",
            variant: "archive",
            decorative: true,
          })}
          <div>
            <strong>${escapeHtml(record.title)}</strong>
          </div>
        </div>
      `,
    },
    {
      header: "Status",
      render: (record: GameRecord) => renderStatusPill(record.status),
    },
    {
      header: "Overall",
      render: (record: GameRecord) => renderFivePointScore(record.overallScore),
    },
    {
      header: "Match",
      render: (record: GameRecord) =>
        record.fitEstimate !== undefined
          ? renderFivePointScore(record.fitEstimate, "fit")
          : renderHundredPointScore(record.profileMatchScore, "match"),
    },
    {
      header: "Priority",
      render: (record: GameRecord) =>
        renderHundredPointScore(record.backlogPriorityScore, "priority"),
    },
    {
      header: "Watch Risk",
      render: (record: GameRecord) =>
        renderHundredPointScore(record.watchRiskScore, "watch"),
    },
    {
      header: "Traits",
      render: (record: GameRecord) => renderTraitList(record.matchedTraits),
    },
    {
      header: "",
      render: (record: GameRecord) => `
        <button
          class="ghost-button"
          type="button"
          data-open-dossier="${escapeHtml(record.gameId)}"
          aria-haspopup="dialog"
          aria-label="Open dossier for ${escapeHtml(record.title)}"
        >
          Inspect
        </button>
      `,
    },
  ];

  const hasActiveFilters =
    filters.query.length > 0 ||
    filters.status !== "all" ||
    filters.genre !== "all" ||
    filters.sortKey !== "priority";

  return `
    <section
      id="library-section"
      class="panel panel-wide section-theme section-theme-library"
      aria-labelledby="library-heading"
    >
      ${renderSectionHead({
        kicker: "Library",
        title: "Unified game view",
        titleId: "library-heading",
        description:
          "Search every known title, compare status and scores, and inspect exactly why the model places a game where it does.",
      })}

      <form class="filter-bar" aria-label="Library filters">
        <div class="control-group control-search">
          <label for="library-search" class="control-label">Search</label>
          <input
            id="library-search"
            class="search-input"
            type="search"
            placeholder="Search by game, series, or genre..."
            value="${escapeHtml(filters.query)}"
          />
        </div>
        <div class="control-group">
          <label for="library-status-filter" class="control-label">Status</label>
          <select id="library-status-filter" class="select-input">
            ${renderOptions(statuses, filters.status, "All statuses")}
          </select>
        </div>
        <div class="control-group">
          <label for="library-genre-filter" class="control-label">Genre</label>
          <select id="library-genre-filter" class="select-input">
            ${renderOptions(genres, filters.genre, "All genres")}
          </select>
        </div>
        <div class="control-group">
          <label for="library-sort" class="control-label">Sort</label>
          <select id="library-sort" class="select-input">
            <option value="priority" ${
              filters.sortKey === "priority" ? "selected" : ""
            }>Backlog priority</option>
            <option value="title" ${
              filters.sortKey === "title" ? "selected" : ""
            }>Title</option>
            <option value="overall" ${
              filters.sortKey === "overall" ? "selected" : ""
            }>Overall score</option>
            <option value="fit" ${
              filters.sortKey === "fit" ? "selected" : ""
            }>Recommendation fit</option>
            <option value="watch" ${
              filters.sortKey === "watch" ? "selected" : ""
            }>Watch risk</option>
            <option value="trap" ${
              filters.sortKey === "trap" ? "selected" : ""
            }>Trap risk</option>
            <option value="updated" ${
              filters.sortKey === "updated" ? "selected" : ""
            }>Recently updated</option>
          </select>
        </div>
        <div class="control-group control-actions">
          <span id="library-results-summary" class="results-summary" aria-live="polite">
            ${visibleRecords} of ${totalRecords} games match
          </span>
          <button
            id="clear-library-filters"
            class="ghost-button"
            type="button"
            ${hasActiveFilters ? "" : "disabled"}
          >
            Clear filters
          </button>
        </div>
      </form>

      ${renderTable(records, columns, {
        caption: "Main library table showing status, scores, and risk by game.",
        emptyMessage: "No games match the current filters.",
      })}

      ${totalPages > 1 ? `
        <div class="card-actions card-actions--pagination pagination-strip">
          <button
            type="button"
            class="ghost-button"
            data-archive-page="${currentPage - 1}"
            ${currentPage === 1 ? "disabled" : ""}
          >
            Previous
          </button>
          <span class="pagination-label">
            Page ${currentPage} of ${totalPages}
          </span>
          <button
            type="button"
            class="ghost-button"
            data-archive-page="${currentPage + 1}"
            ${currentPage >= totalPages ? "disabled" : ""}
          >
            Next
          </button>
        </div>
      ` : ""}
    </section>
  `;
}
