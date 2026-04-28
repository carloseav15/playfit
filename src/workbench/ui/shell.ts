import type { AppData, AppTab } from "../data/schema";
import type { TodayDecisionModel } from "../domain/today";
import { renderActionRow } from "./components/meta";
import { escapeHtml } from "./utils";

export const APP_TABS: Array<{ id: AppTab; label: string; description: string }> = [
  {
    id: "today",
    label: "Today",
    description: "Best next moves, strongest recommendations, and immediate risks.",
  },
  {
    id: "collections",
    label: "Collections",
    description: "Browse franchises, rails, and cover-led shelves like a gaming media wall.",
  },
  {
    id: "library",
    label: "Archive",
    description: "Search and filter every known game in your library.",
  },
  {
    id: "patterns",
    label: "Patterns",
    description: "See what kind of player you are.",
  },
];

interface RenderAppShellOptions {
  activeTab: { id: AppTab; label: string; description: string };
  todayModel: TodayDecisionModel;
  mainContent: string;
  data: AppData;
  dossierMarkup: string;
  query: string;
  visibleCount: number;
  tabTransition: boolean;
  energyLevel: "high" | "low" | "normal";
  theme: "dark" | "light";
}

function renderThemeIcon(theme: "dark" | "light") {
  if (theme === "light") {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3c0 5 4 9 9.79 9.79Z" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77" stroke-linecap="round" />
    </svg>
  `;
}

function energyContext(energyLevel: "high" | "low" | "normal") {
  if (energyLevel === "low") {
    return {
      title: "Low battery mode",
      description: "Fast, low-friction sessions are favored until momentum comes back.",
    };
  }

  if (energyLevel === "high") {
    return {
      title: "High energy mode",
      description: "Long arcs, heavier systems, and demanding runs are viable right now.",
    };
  }

  return {
    title: "Balanced mode",
    description: "The queue is balanced between momentum, fit, and recovery cost.",
  };
}

function renderHero(
  activeTab: AppTab,
  todayModel: TodayDecisionModel,
  energyLevel: "high" | "low" | "normal",
) {
  if (activeTab !== "today") {
    return "";
  }

  const mode = energyContext(energyLevel);
  const heroTitle = todayModel.currentRun ? "Current run pinned" : mode.title;
  const heroDescription = todayModel.currentRun
    ? `${todayModel.currentRun.title} is your active run. Fresh picks stay secondary until you change status. ${mode.description}`
    : mode.description;

  return `
    <header class="hero">
      <div class="hero-copy">
        <h1>Know what to play next.</h1>
        <p class="eyebrow">Games Library</p>
        <p class="hero-text">One workspace for every game decision.</p>

        ${renderActionRow(
          [
            {
              label: "Refresh data",
              variant: "ghost",
              attributes: `id="refresh-button"`,
            },
            {
              label: "Open collections",
              variant: "subtle",
              attributes: `data-app-tab="collections"`,
            },
          ],
          "hero-actions card-actions card-actions--hero",
        )}
      </div>

      <article class="hero-context-card">
        <p class="eyebrow">Queue state</p>
        <h2>${escapeHtml(heroTitle)}</h2>
        <p class="summary-note">${escapeHtml(heroDescription)}</p>
        <div class="hero-meta-grid">
          <p>
            <strong>${todayModel.activeRunCount}</strong>
            <span>Active run</span>
          </p>
          <p>
            <strong>${todayModel.nextUpCount}</strong>
            <span>Fresh picks</span>
          </p>
          <p>
            <strong>${todayModel.resumeCount}</strong>
            <span>Resume lane</span>
          </p>
        </div>
      </article>
    </header>
  `;
}

function renderGlobalHeader(
  activeTab: { id: AppTab; label: string; description: string },
  energyLevel: string,
  theme: "dark" | "light",
) {
  return `
    <header class="global-header">
      <div class="global-header-inner">
        <div class="logo">
          <div class="logo-dot"></div>
          STATION V1
        </div>
        <div class="header-actions">
          <button
            id="theme-toggle"
            class="ghost-button icon-button"
            type="button"
            aria-label="${theme === "light" ? "Switch to dark theme" : "Switch to light theme"}"
          >
            ${renderThemeIcon(theme)}
          </button>
          <select id="energy-level-select" class="select-input compact-select" aria-label="Energy level">
            <option value="high" ${energyLevel === "high" ? "selected" : ""}>⚡ High energy</option>
            <option value="normal" ${energyLevel === "normal" ? "selected" : ""}>◉ Normal</option>
            <option value="low" ${energyLevel === "low" ? "selected" : ""}>☕ Low battery</option>
          </select>
          <nav class="tab-strip" role="tablist" aria-label="Main views">
            ${APP_TABS.map(
              (tab) => `
                <button
                  id="tab-${tab.id}"
                  class="tab-button ${tab.id === activeTab.id ? "is-active" : ""}"
                  type="button"
                  role="tab"
                  aria-selected="${tab.id === activeTab.id}"
                  aria-controls="panel-${tab.id}"
                  data-app-tab="${tab.id}"
                >
                  ${escapeHtml(tab.label)}
                </button>
              `,
            ).join("")}
          </nav>
        </div>
      </div>
    </header>
  `;
}

export function renderAppShell({
  activeTab,
  todayModel,
  mainContent,
  data,
  dossierMarkup,
  query,
  visibleCount,
  tabTransition,
  energyLevel,
  theme,
}: RenderAppShellOptions) {
  return `
    ${renderGlobalHeader(activeTab, energyLevel, theme)}
    <div class="page-shell">
      <a class="skip-link" href="#main-content">Skip to content</a>
      ${renderHero(activeTab.id, todayModel, energyLevel)}

      <main id="main-content" class="dashboard">
        <div id="search-announcer" class="sr-only" aria-live="polite">
          ${
            query
              ? `Library filtered: ${visibleCount} visible records out of ${data.records.length} for "${escapeHtml(query)}"`
              : ""
          }
        </div>
        <div class="status-strip sr-only" role="status" aria-live="polite">
          <p><strong>${escapeHtml(activeTab.label)}</strong>: ${escapeHtml(activeTab.description)}</p>
        </div>
        <section
          id="panel-${activeTab.id}"
          class="tab-panel ${tabTransition ? "tab-content-enter" : ""}"
          role="tabpanel"
          aria-labelledby="tab-${activeTab.id}"
        >
          ${mainContent}
        </section>
      </main>

      ${dossierMarkup}
    </div>
  `;
}
