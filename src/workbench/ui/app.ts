import type { AppData, AppTab, GameRecord, SortKey } from "../data/schema";
import { buildTodayDecisionModel } from "../domain/today";
import {
  buildSearchIndex,
  filterAndSortRecords,
  uniqueGenres,
  uniqueStatuses,
  type LibraryFilters,
} from "../domain/filters";
import { hydrateCoverArt } from "./components/cover-art";
import { renderGameDossier } from "./components/game-dossier";
import { APP_TABS, renderAppShell } from "./shell";
import {
  renderCollectionsSection,
  type CollectionsSubTab,
} from "./sections/collections";
import { renderLibrarySection } from "./sections/library";
import { renderPatternsSection } from "./sections/patterns";
import { renderTodaySection } from "./sections/today";

interface AppControllerState {
  activeTab: AppTab;
  filters: LibraryFilters;
  energyLevel: "high" | "low" | "normal";
  theme: "dark" | "light";
  ignoredGameIds: Set<string>;
  dossierGameId: string | null;
  focusDossier: boolean;
  restoreControlId: string | null;
  restoreSelectionStart: number | null;
  returnFocusSelector: string | null;
  tabTransition: boolean;
  archivePage: number;
  selectedCollectionRailId: string | null;
  selectedCollectionItemKey: string | null;
  focusCollectionSpotlight: boolean;
  activeCollectionsSubTab: CollectionsSubTab;
}

const DEFAULT_FILTERS: LibraryFilters = {
  query: "",
  status: "all",
  genre: "all",
  sortKey: "priority",
};

function getDefaultCollectionsSubTab(data: AppData): CollectionsSubTab {
  const continueRuns = data.collectionRails.find((rail) => rail.id === "continue-runs");
  const highRisk = data.collectionRails.find((rail) => rail.id === "high-risk-temptations");
  const hasFranchiseContent =
    data.collectionRails.some((rail) =>
      ["best-franchise-fits", "play-next-in-franchise"].includes(rail.id),
    ) || data.franchiseShelves.length > 0;
  const hasUpcomingContent = data.upcomingReleaseRecords.length > 0;

  if ((continueRuns?.items.length ?? 0) > 0) {
    return "continue";
  }

  if (hasFranchiseContent) {
    return "franchises";
  }

  if (hasUpcomingContent) {
    return "upcoming";
  }

  if ((highRisk?.items.length ?? 0) > 0) {
    return "continue";
  }

  return "upcoming";
}

class AppController {
  private readonly searchIndex;
  private readonly state: AppControllerState;

  constructor(
    private readonly root: HTMLElement,
    private readonly data: AppData,
    private readonly onRefresh: () => Promise<void>,
  ) {
    this.searchIndex = buildSearchIndex(data.records);
    this.state = {
      activeTab: "today",
      filters: { ...DEFAULT_FILTERS },
      energyLevel: "normal",
      theme: "dark",
      ignoredGameIds: new Set(),
      dossierGameId: null,
      focusDossier: false,
      restoreControlId: null,
      restoreSelectionStart: null,
      returnFocusSelector: null,
      tabTransition: false,
      archivePage: 1,
      selectedCollectionRailId: null,
      selectedCollectionItemKey: null,
      focusCollectionSpotlight: false,
      activeCollectionsSubTab: getDefaultCollectionsSubTab(data),
    };

    this.loadSavedState();
    this.bindEvents();
  }

  private readonly handleClick = (event: Event) => {
    const target = event.target as HTMLElement | null;

    if (!target) {
      return;
    }

    if (target.closest("[data-close-dossier]")) {
      this.closeDossier();
      return;
    }

    const openDossierButton = target.closest<HTMLElement>("[data-open-dossier]");
    if (openDossierButton?.dataset.openDossier) {
      this.openDossier(openDossierButton.dataset.openDossier);
      return;
    }

    const railScrollButton = target.closest<HTMLElement>("[data-rail-scroll]");
    if (railScrollButton?.dataset.railScroll && railScrollButton.dataset.railId) {
      const track = this.root.querySelector<HTMLElement>(
        `[data-rail-track][data-rail-id="${railScrollButton.dataset.railId}"]`,
      );

      if (!track) {
        return;
      }

      const direction = railScrollButton.dataset.railScroll === "prev" ? -1 : 1;
      const amount = Math.max(track.clientWidth * 0.85, 320);
      track.scrollBy({ left: amount * direction, behavior: "smooth" });
      return;
    }

    const collectionsTabButton = target.closest<HTMLElement>("[data-collections-tab]");
    if (collectionsTabButton?.dataset.collectionsTab) {
      const nextSubTab = collectionsTabButton.dataset.collectionsTab as CollectionsSubTab;

      if (nextSubTab !== this.state.activeCollectionsSubTab) {
        this.state.activeCollectionsSubTab = nextSubTab;
        this.state.selectedCollectionItemKey = null;
        this.state.selectedCollectionRailId = null;
        this.state.focusCollectionSpotlight = false;
        this.render();
      }

      return;
    }

    const collectionCard = target.closest<HTMLElement>("[data-select-collection-item]");
    if (collectionCard?.dataset.selectCollectionItem && collectionCard.dataset.railId) {
      const nextItemKey = collectionCard.dataset.selectCollectionItem;
      const nextRailId = collectionCard.dataset.railId;
      const isSameSelection =
        this.state.selectedCollectionItemKey === nextItemKey &&
        this.state.selectedCollectionRailId === nextRailId;

      this.state.selectedCollectionItemKey = isSameSelection ? null : nextItemKey;
      this.state.selectedCollectionRailId = isSameSelection ? null : nextRailId;
      this.state.focusCollectionSpotlight = !isSameSelection;
      this.render();
      return;
    }

    const tabButton = target.closest<HTMLElement>("[data-app-tab]");
    if (tabButton?.dataset.appTab) {
      const nextTab = tabButton.dataset.appTab as AppTab;

      if (nextTab !== this.state.activeTab) {
        this.state.activeTab = nextTab;
        this.state.tabTransition = true;
        this.render();
      }

      return;
    }

    if (target.closest("#theme-toggle")) {
      this.state.theme = this.state.theme === "dark" ? "light" : "dark";
      this.render();
      return;
    }

    if (target.closest("#zen-pass-button")) {
      const button = target.closest<HTMLElement>("#zen-pass-button");
      if (button?.dataset.gameId) {
        this.state.ignoredGameIds.add(button.dataset.gameId);
        this.render();
      }
      return;
    }

    if (target.closest("#clear-library-filters")) {
      this.state.filters = { ...DEFAULT_FILTERS };
      this.state.archivePage = 1;
      this.render();
      return;
    }

    if (target.closest("#refresh-button")) {
      void this.onRefresh();
      return;
    }

    if (target.closest("[data-submit-checkin]")) {
      const input = this.root.querySelector<HTMLTextAreaElement>("#nlp-checkin-input");
      if (input?.value.trim()) {
        const button = target.closest<HTMLButtonElement>("[data-submit-checkin]");
        if (button) {
          button.textContent = "\u2713 Check-in logged";
          button.disabled = true;
          input.disabled = true;
        }
      }
      return;
    }

    if (target.closest("[data-reset-session]")) {
      this.state.ignoredGameIds.clear();
      this.render();
      return;
    }

    const archivePageButton = target.closest<HTMLElement>("[data-archive-page]");
    if (archivePageButton?.dataset.archivePage) {
      this.state.archivePage = Number(archivePageButton.dataset.archivePage);
      this.render();
    }
  };

  private readonly handleInput = (event: Event) => {
    const target = event.target;

    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    if (target.id === "library-search") {
      this.state.filters.query = target.value;
      this.state.archivePage = 1;
      this.queueControlFocusRestore(
        target.id,
        target.selectionStart ?? target.value.length,
      );
      this.render();
    }
  };

  private readonly handleChange = (event: Event) => {
    const target = event.target;

    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    if (target.id === "energy-level-select") {
      this.state.energyLevel = target.value as "high" | "low" | "normal";
      this.render();
      return;
    }

    if (target.id === "library-status-filter") {
      this.state.filters.status = target.value;
      this.state.archivePage = 1;
      this.queueControlFocusRestore(target.id);
      this.render();
      return;
    }

    if (target.id === "library-genre-filter") {
      this.state.filters.genre = target.value;
      this.state.archivePage = 1;
      this.queueControlFocusRestore(target.id);
      this.render();
      return;
    }

    if (target.id === "library-sort") {
      this.state.filters.sortKey = target.value as SortKey;
      this.state.archivePage = 1;
      this.queueControlFocusRestore(target.id);
      this.render();
    }
  };

  private readonly handleKeydown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;

    if (!target) {
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === "k") {
      event.preventDefault();
      if (this.state.activeTab !== "library") {
        this.state.tabTransition = true;
      }
      this.state.activeTab = "library";
      this.queueControlFocusRestore("library-search");
      this.render();
      return;
    }

    if (event.key === "Escape" && target.closest("[data-dossier-dialog]")) {
      event.preventDefault();
      this.closeDossier();
      return;
    }

    if (target.matches("[data-rail-track]")) {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const rail = target as HTMLElement;
        rail.scrollBy({
          left: Math.max(rail.clientWidth * 0.72, 260) * direction,
          behavior: "smooth",
        });
        return;
      }
    }

    if (event.key === "Tab" && target.closest("[data-dossier-dialog]")) {
      this.maintainDossierFocus(event);
      return;
    }

    if (
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !target.matches("input, select, textarea") &&
      !this.state.dossierGameId
    ) {
      const tabIndex = Number(event.key) - 1;

      if (tabIndex >= 0 && tabIndex < APP_TABS.length) {
        event.preventDefault();
        const nextTab = APP_TABS[tabIndex].id;

        if (nextTab !== this.state.activeTab) {
          this.state.activeTab = nextTab;
          this.state.tabTransition = true;
          this.render();
        }
      }
    }
  };

  private readonly handleSubmit = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (target?.matches(".filter-bar")) {
      event.preventDefault();
    }
  };

  private bindEvents() {
    this.root.addEventListener("click", this.handleClick);
    this.root.addEventListener("input", this.handleInput);
    this.root.addEventListener("change", this.handleChange);
    this.root.addEventListener("keydown", this.handleKeydown);
    this.root.addEventListener("submit", this.handleSubmit);
  }

  destroy() {
    this.root.removeEventListener("click", this.handleClick);
    this.root.removeEventListener("input", this.handleInput);
    this.root.removeEventListener("change", this.handleChange);
    this.root.removeEventListener("keydown", this.handleKeydown);
    this.root.removeEventListener("submit", this.handleSubmit);
    document.body.classList.remove("has-modal-open");
    document.body.classList.remove("theme-light");
  }

  private getFilteredRecords() {
    return filterAndSortRecords(
      this.data.records,
      this.searchIndex,
      this.state.filters,
    );
  }

  private getRecordById(gameId: string | null) {
    if (!gameId) {
      return null;
    }

    return this.data.records.find((record) => record.gameId === gameId) ?? null;
  }

  private getActiveTab() {
    return APP_TABS.find((tab) => tab.id === this.state.activeTab) ?? APP_TABS[0];
  }

  private renderActiveTabContent(
    records: GameRecord[],
    todayModel: ReturnType<typeof buildTodayDecisionModel>,
  ) {
    switch (this.state.activeTab) {
      case "today":
        return renderTodaySection(todayModel, this.state.energyLevel);
      case "collections":
        return renderCollectionsSection({
          collectionRails: this.data.collectionRails,
          franchiseShelves: this.data.franchiseShelves,
          upcomingReleaseRecords: this.data.upcomingReleaseRecords,
          selectedRailId: this.state.selectedCollectionRailId,
          selectedItemKey: this.state.selectedCollectionItemKey,
          energyLevel: this.state.energyLevel,
          activeSubTab: this.state.activeCollectionsSubTab,
        });
      case "library": {
        const itemsPerPage = 20;
        const totalPages = Math.ceil(records.length / itemsPerPage) || 1;
        if (this.state.archivePage > totalPages) {
          this.state.archivePage = totalPages;
        }

        const startIndex = (this.state.archivePage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;

        return renderLibrarySection({
          records: records.slice(startIndex, endIndex),
          totalRecords: this.data.records.length,
          visibleRecords: records.length,
          filters: this.state.filters,
          statuses: uniqueStatuses(this.data.records),
          genres: uniqueGenres(this.data.records),
          currentPage: this.state.archivePage,
          totalPages,
        });
      }
      case "patterns":
        return renderPatternsSection(
          this.data.records,
          this.data.profile,
          this.data.recommendations,
        );
      default:
        return "";
    }
  }

  private openDossier(gameId: string) {
    this.state.dossierGameId = gameId;
    this.state.focusDossier = true;
    this.state.returnFocusSelector = `[data-open-dossier="${gameId}"]`;
    this.clearFocusRestore();
    this.render();
  }

  private closeDossier() {
    this.state.dossierGameId = null;
    this.render();
  }

  private saveState() {
    try {
      localStorage.setItem(
        "games-library-state",
        JSON.stringify({
          activeTab: this.state.activeTab,
          filters: {
            status: this.state.filters.status,
            genre: this.state.filters.genre,
            sortKey: this.state.filters.sortKey,
          },
          energyLevel: this.state.energyLevel,
          theme: this.state.theme,
        }),
      );
    } catch {
      // Ignore storage errors
    }
  }

  private loadSavedState() {
    try {
      const raw = localStorage.getItem("games-library-state");
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.activeTab && APP_TABS.some((tab) => tab.id === saved.activeTab)) {
        this.state.activeTab = saved.activeTab;
      }
      if (saved.filters) {
        if (saved.filters.status) this.state.filters.status = saved.filters.status;
        if (saved.filters.genre) this.state.filters.genre = saved.filters.genre;
        if (saved.filters.sortKey) this.state.filters.sortKey = saved.filters.sortKey;
      }
      if (saved.energyLevel) {
        this.state.energyLevel = saved.energyLevel;
      }
      if (saved.theme) {
        this.state.theme = saved.theme;
      }
    } catch {
      // Ignore parse errors
    }
  }

  private queueControlFocusRestore(controlId: string, selectionStart?: number | null) {
    this.state.restoreControlId = controlId;
    this.state.restoreSelectionStart = selectionStart ?? null;
  }

  private clearFocusRestore() {
    this.state.restoreControlId = null;
    this.state.restoreSelectionStart = null;
  }

  private restoreControlFocus() {
    if (!this.state.restoreControlId) {
      return false;
    }

    const control = this.root.querySelector<HTMLElement>(
      `#${this.state.restoreControlId}`,
    );

    if (!control) {
      this.clearFocusRestore();
      return false;
    }

    control.focus();

    if (
      control instanceof HTMLInputElement &&
      this.state.restoreSelectionStart !== null
    ) {
      const position = this.state.restoreSelectionStart;
      control.setSelectionRange(position, position);
    }

    this.clearFocusRestore();
    return true;
  }

  private restoreReturnFocus() {
    if (!this.state.returnFocusSelector) {
      return false;
    }

    const focusTarget = this.root.querySelector<HTMLElement>(
      this.state.returnFocusSelector,
    );

    this.state.returnFocusSelector = null;

    if (!focusTarget) {
      return false;
    }

    focusTarget.focus();
    return true;
  }

  private maintainDossierFocus(event: KeyboardEvent) {
    const dossier = this.root.querySelector<HTMLElement>("[data-dossier-dialog]");

    if (!dossier) {
      return;
    }

    const focusableElements = Array.from(
      dossier.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    );

    if (focusableElements.length === 0) {
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  render() {
    const previousRailOffsets = new Map<string, number>();
    this.root
      .querySelectorAll<HTMLElement>("[data-rail-track][data-rail-id]")
      .forEach((track) => {
        const railId = track.dataset.railId;
        if (railId) {
          previousRailOffsets.set(railId, track.scrollLeft);
        }
      });

    const records = this.getFilteredRecords();
    const dossierRecord = this.getRecordById(this.state.dossierGameId);
    const todayModel = buildTodayDecisionModel(
      this.data.records,
      this.state.energyLevel,
      this.state.ignoredGameIds,
    );
    const activeTab = this.getActiveTab();

    const tabTransition = this.state.tabTransition;
    this.state.tabTransition = false;

    document.body.classList.toggle("has-modal-open", Boolean(dossierRecord));
    document.body.classList.toggle("theme-light", this.state.theme === "light");

    this.root.innerHTML = renderAppShell({
      activeTab,
      todayModel,
      mainContent: this.renderActiveTabContent(records, todayModel),
      data: this.data,
      dossierMarkup: renderGameDossier(dossierRecord),
      query: this.state.filters.query,
      visibleCount: records.length,
      tabTransition,
      energyLevel: this.state.energyLevel,
      theme: this.state.theme,
    });

    hydrateCoverArt(this.root);

    this.root
      .querySelectorAll<HTMLElement>("[data-rail-track][data-rail-id]")
      .forEach((track) => {
        const railId = track.dataset.railId;
        if (!railId) {
          return;
        }

        const previous = previousRailOffsets.get(railId);
        if (previous !== undefined) {
          track.scrollLeft = previous;
        }
      });

    if (tabTransition) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    if (this.state.focusDossier) {
      this.root.querySelector<HTMLElement>("[data-dossier-dialog]")?.focus();
      this.state.focusDossier = false;
    } else if (this.state.focusCollectionSpotlight) {
      this.root.querySelector<HTMLElement>("#collection-spotlight-title")?.focus();
      this.state.focusCollectionSpotlight = false;
    } else if (this.restoreControlFocus()) {
      return;
    } else if (this.restoreReturnFocus()) {
      this.saveState();
      return;
    }

    this.saveState();
  }
}

export function createApp(
  root: HTMLElement,
  data: AppData,
  onRefresh: () => Promise<void>,
) {
  const controller = new AppController(root, data, onRefresh);
  controller.render();

  return controller;
}
