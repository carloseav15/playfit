import type { CollectionRail, UpcomingReleaseRecord } from "../../data/schema";
import { getContextualScore } from "../../domain/scoring";
import { renderChip } from "../components/chips";
import { renderContentRail } from "../components/content-rail";
import { renderEmptyState } from "../components/empty-state";
import { renderSectionHead } from "../components/section-head";
import { renderTable } from "../components/table";
import { escapeHtml } from "../utils";

export type CollectionsSubTab = "continue" | "franchises" | "upcoming";

interface CollectionsSectionProps {
  collectionRails: CollectionRail[];
  franchiseShelves: CollectionRail[];
  upcomingReleaseRecords: UpcomingReleaseRecord[];
  selectedRailId: string | null;
  selectedItemKey: string | null;
  energyLevel: "high" | "low" | "normal";
  activeSubTab: CollectionsSubTab;
}

function sortRailForContext(rail: CollectionRail, energyLevel: "high" | "low" | "normal") {
  if (rail.id !== "continue-runs") {
    return rail;
  }

  return {
    ...rail,
    items: [...rail.items].sort((left, right) => {
      const leftScore = left.record ? getContextualScore(left.record, energyLevel) : 0;
      const rightScore = right.record ? getContextualScore(right.record, energyLevel) : 0;
      return rightScore - leftScore;
    }),
  };
}

function renderCollectionsSubTabs(
  activeSubTab: CollectionsSubTab,
  counts: Record<CollectionsSubTab, number>,
) {
  const tabs: Array<{ id: CollectionsSubTab; label: string }> = [
    { id: "continue", label: "Continue" },
    { id: "franchises", label: "Franchises" },
    { id: "upcoming", label: "Upcoming" },
  ];

  return `
    <div class="collections-subtabs" role="tablist" aria-label="Collections views">
      ${tabs
        .map(
          (tab) => `
            <button
              id="collections-subtab-${tab.id}"
              class="collections-subtab-button ${tab.id === activeSubTab ? "is-active" : ""}"
              type="button"
              role="tab"
              aria-selected="${tab.id === activeSubTab}"
              aria-controls="collections-subpanel-${tab.id}"
              data-collections-tab="${tab.id}"
            >
              <span>${tab.label}</span>
              <span class="collections-subtab-count">${counts[tab.id]}</span>
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function fitTone(tier: UpcomingReleaseRecord["fitTier"]) {
  if (tier === "high") return "success";
  if (tier === "medium") return "warning";
  return "neutral";
}

function fitLabel(tier: UpcomingReleaseRecord["fitTier"]) {
  if (tier === "high") return "High";
  if (tier === "medium") return "Medium";
  return "Low";
}

function renderUpcomingReleaseList(upcomingReleaseRecords: UpcomingReleaseRecord[]) {
  return renderTable(
    upcomingReleaseRecords,
    [
      {
        header: "Release",
        className: "col-upcoming-date",
        render: (row) => `
          <div class="upcoming-release-date">
            <strong>${escapeHtml(row.releaseLabel)}</strong>
          </div>
        `,
      },
      {
        header: "Game",
        className: "col-title",
        render: (row) => `
          <div class="upcoming-release-title-block">
            <strong>${escapeHtml(row.title)}</strong>
            ${
              row.series && row.series !== row.title ? `<span>${escapeHtml(row.series)}</span>` : ""
            }
          </div>
        `,
      },
      {
        header: "Platforms",
        render: (row) => `
          <span class="upcoming-release-platforms">
            ${escapeHtml(row.platforms || "TBA")}
          </span>
        `,
      },
      {
        header: "Signal",
        render: (row) => `
          <div class="upcoming-release-signal-stack">
            <div class="inline-chip-list">
              ${renderChip(`${fitLabel(row.fitTier)} fit`, fitTone(row.fitTier))}
              ${row.trackedUniverse ? renderChip("In your universes", "warning") : ""}
              ${row.availableToUser ? renderChip("Available to you", "success") : ""}
            </div>
            <p class="upcoming-release-note">
              ${escapeHtml(row.fitReasons.slice(0, 2).join(" • "))}
            </p>
          </div>
        `,
      },
    ],
    {
      caption: "Upcoming releases ordered from soonest to latest with fit signals.",
      emptyMessage: "No tracked upcoming releases yet.",
    },
  );
}

export function renderCollectionsSection({
  collectionRails,
  franchiseShelves,
  upcomingReleaseRecords,
  selectedRailId,
  selectedItemKey,
  energyLevel,
  activeSubTab,
}: CollectionsSectionProps) {
  const contextualRails = collectionRails.map((rail) => sortRailForContext(rail, energyLevel));
  const continueRails = contextualRails.filter((rail) =>
    ["continue-runs", "high-risk-temptations"].includes(rail.id),
  );
  const franchiseRails = contextualRails.filter((rail) =>
    ["best-franchise-fits", "play-next-in-franchise"].includes(rail.id),
  );
  const tabCounts: Record<CollectionsSubTab, number> = {
    continue: continueRails.length,
    franchises: franchiseRails.length + franchiseShelves.length,
    upcoming: upcomingReleaseRecords.length,
  };
  const visibleRails = activeSubTab === "continue" ? continueRails : franchiseRails;
  const tabEmptyMessage =
    activeSubTab === "continue"
      ? "No active runs or high-risk temptations are standing out right now."
      : "No franchise rails are available yet.";

  return `
    <section
      id="collections-section"
      class="collections-stage"
      aria-labelledby="collections-heading"
    >
      <div class="collections-intro-shell">
        ${renderSectionHead({
          kicker: "Collections",
          title: "Franchises and cover-driven discovery",
          titleId: "collections-heading",
          description:
            "Browse your strongest universes like a media wall, keep active runs visible, and inspect the next franchise step without leaving the rail.",
          meta: [
            { label: `${collectionRails.length} live rails`, tone: "neutral" },
            { label: `${franchiseShelves.length} franchise shelves`, tone: "warning" },
          ],
        })}
        ${renderCollectionsSubTabs(activeSubTab, tabCounts)}
      </div>

      <section
        id="collections-subpanel-${activeSubTab}"
        class="collections-tab-panel"
        role="tabpanel"
        aria-labelledby="collections-subtab-${activeSubTab}"
      >
        ${
          activeSubTab === "upcoming"
            ? `
              <div class="upcoming-release-shell">
                <div class="upcoming-release-head">
                  <p class="eyebrow">Release watch</p>
                  <p class="section-description">
                    Ordered from soonest to latest. Fit signals use the same profile-match logic as the main catalog while staying outside your active queue until release.
                  </p>
                </div>
                ${renderUpcomingReleaseList(upcomingReleaseRecords)}
              </div>
            `
            : visibleRails.length > 0
              ? `
                <div class="collections-rail-stack">
                  ${visibleRails
                    .map((rail) =>
                      renderContentRail({
                        rail,
                        selectedItemKey: selectedRailId === rail.id ? selectedItemKey : null,
                      }),
                    )
                    .join("")}
                </div>
              `
              : `<div class="collections-empty-state">${renderEmptyState(tabEmptyMessage)}</div>`
        }
      </section>

      ${
        activeSubTab === "franchises" && franchiseShelves.length > 0
          ? `
            <div class="collections-divider" aria-hidden="true"></div>

            <section class="collections-shelf-zone" aria-labelledby="franchise-shelves-heading">
              <div class="collections-shelf-head">
                <p class="eyebrow">Franchises</p>
                <h3 id="franchise-shelves-heading">Full chronology shelves</h3>
                <p class="section-description">
                  Each shelf is ordered from oldest to newest, including remakes, remasters, spin-offs, and upcoming entries.
                </p>
              </div>
              <div class="collections-rail-stack">
                ${franchiseShelves
                  .map((rail) =>
                    renderContentRail({
                      rail,
                      selectedItemKey: selectedRailId === rail.id ? selectedItemKey : null,
                    }),
                  )
                  .join("")}
              </div>
            </section>
          `
          : ""
      }
    </section>
  `;
}
