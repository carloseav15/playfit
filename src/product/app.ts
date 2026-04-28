import {
  requestFinderInsight,
  requestOnboardingProfile,
} from "./ai/client";
import {
  buildFallbackProfile,
  canAdvanceOnboarding,
  nextOnboardingStep,
  ONBOARDING_FRICTION_CHIPS,
  ONBOARDING_PLAY_PATTERN_CHIPS,
  ONBOARDING_PRIORITY_CHIPS,
} from "./domain/onboarding";
import {
  buildFinderIndex,
  buildTodayModel,
  scoreSeedGame,
  searchSeedGames,
} from "./domain/recommendations";
import { createInitialState, saveProductState, resetProductState } from "./store/indexed-db";
import type {
  FinderInsight,
  ProductConfidence,
  ProductGameSentiment,
  ProductGameStatus,
  ProductOwnershipStatus,
  ProductSeedData,
  ProductRuntimeMode,
  ProductState,
  ProductTodayModel,
  RankedSeedGame,
  SeedGame,
} from "./types";

type ProductTab = "onboarding" | "today" | "finder";
type AnchorKind = "liked" | "disliked" | "current";

interface ProductUiState {
  activeTab: ProductTab;
  onboardingSearch: Record<AnchorKind, string>;
  finderQuery: string;
  finderSelectedGameId: string | null;
  completionPickerGameId: string | null;
  dropPickerGameId: string | null;
  finderInsight:
    | {
        gameId: string;
        status: "loading" | "ready" | "error";
        insight?: FinderInsight;
        error?: string;
      }
    | null;
  statusMessage: string | null;
}

interface FocusSnapshot {
  selector: string;
  selectionStart: number | null;
  selectionEnd: number | null;
}

function cloneState(state: ProductState): ProductState {
  return JSON.parse(JSON.stringify(state)) as ProductState;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function nowIso() {
  return new Date().toISOString();
}

function buildFocusSelector(element: Element) {
  const htmlElement = element as HTMLElement;

  if (htmlElement.dataset.field) {
    const parts = [`[data-field="${htmlElement.dataset.field}"]`];

    if (htmlElement.dataset.kind) {
      parts.push(`[data-kind="${htmlElement.dataset.kind}"]`);
    }

    if (htmlElement.dataset.platformId) {
      parts.push(`[data-platform-id="${htmlElement.dataset.platformId}"]`);
    }

    return `${element.tagName.toLowerCase()}${parts.join("")}`;
  }

  return null;
}

function captureFocusSnapshot(root: HTMLElement): FocusSnapshot | null {
  const activeElement = document.activeElement;

  if (!(activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)) {
    return null;
  }

  if (!root.contains(activeElement)) {
    return null;
  }

  const selector = buildFocusSelector(activeElement);
  if (!selector) {
    return null;
  }

  return {
    selector,
    selectionStart: activeElement.selectionStart,
    selectionEnd: activeElement.selectionEnd,
  };
}

function restoreFocusSnapshot(root: HTMLElement, snapshot: FocusSnapshot | null) {
  if (!snapshot) {
    return;
  }

  const element = root.querySelector(snapshot.selector);

  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    return;
  }

  element.focus({ preventScroll: true });

  if (snapshot.selectionStart !== null && snapshot.selectionEnd !== null) {
    element.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
  }
}

function formatConfidence(value: ProductConfidence) {
  switch (value) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium confidence";
    case "low":
    default:
      return "Low confidence";
  }
}

function formatPlatformAvailability(entry: RankedSeedGame) {
  switch (entry.platformAvailability) {
    case "available":
      return "Available on one of your platforms";
    case "unavailable":
      return "No mapped platform in your current setup";
    case "unknown":
    default:
      return "Platform mapping still incomplete";
  }
}

function formatReleaseState(value: RankedSeedGame["game"]["releaseState"]) {
  return value === "unreleased" ? "Unreleased" : "Released";
}

function formatOwnershipStatus(value: ProductOwnershipStatus) {
  switch (value) {
    case "owned":
      return "Owned";
    case "wishlist":
      return "Wishlist";
    case "not_owned":
      return "Not owned";
    case "unknown":
    default:
      return "Ownership unknown";
  }
}

function formatCompletionOutcome(value: ProductGameSentiment | undefined) {
  switch (value) {
    case "liked":
      return "Loved it";
    case "mixed":
      return "Mixed";
    case "disliked":
      return "Finished but not for me";
    default:
      return "Completed";
  }
}

function summarizeRankedGame(entry: RankedSeedGame) {
  if (entry.affinityScore >= 78 && entry.riskScore <= 35) {
    return "Strong fit with manageable risk based on the signals already captured.";
  }

  if (entry.riskScore >= 58) {
    return "Interesting on paper, but the current profile shows enough friction to be cautious.";
  }

  if (entry.affinityScore >= 62) {
    return "Promising fit, but still worth validating with a short first session.";
  }

  return "Early signal is mixed. This needs more profile data before it becomes a strong bet.";
}

function createEmptyState(message: string, actionLabel?: string, action?: string) {
  return `
    <div class="product-empty-state">
      <p>${escapeHtml(message)}</p>
      ${
        actionLabel && action
          ? `<div class="product-actions"><button class="product-button product-button-secondary" data-action="${escapeHtml(action)}">${escapeHtml(actionLabel)}</button></div>`
          : ""
      }
    </div>
  `;
}

function renderChip(label: string, tone: "positive" | "negative" | "warning" = "positive") {
  return `<span class="product-chip product-chip-${tone}">${escapeHtml(label)}</span>`;
}

function renderSelectableChip(params: {
  action: string;
  label: string;
  selected: boolean;
  id: string;
  group: string;
}) {
  return `
    <button
      type="button"
      class="product-pill-button${params.selected ? " is-selected" : ""}"
      data-action="${escapeHtml(params.action)}"
      data-chip-id="${escapeHtml(params.id)}"
      data-chip-group="${escapeHtml(params.group)}"
      aria-pressed="${params.selected ? "true" : "false"}"
    >
      ${escapeHtml(params.label)}
    </button>
  `;
}

function getOnboardingGateMessage(state: ProductState) {
  const draft = state.user.onboarding;

  if (draft.step === "platforms") {
    return draft.platforms.length > 0
      ? "Platform setup complete."
      : "Select at least one platform to continue.";
  }

  if (draft.step === "anchors") {
    return `Choose ${Math.max(0, 3 - draft.likedGameIds.length)} more liked game${Math.max(0, 3 - draft.likedGameIds.length) === 1 ? "" : "s"} and ${Math.max(0, 3 - draft.dislikedGameIds.length)} more disliked game${Math.max(0, 3 - draft.dislikedGameIds.length) === 1 ? "" : "s"} to continue.`;
  }

  if (draft.step === "interview") {
    const missing = [
      draft.answers.selectedPriorities.length === 0 ? "at least one fit signal" : null,
      draft.answers.selectedFrictionSignals.length === 0 ? "at least one friction signal" : null,
      !draft.answers.selectedPlayPattern ? "one play-pattern choice" : null,
    ].filter(Boolean);

    return missing.length > 0
      ? `Complete the remaining answers: ${missing.join(", ")}.`
      : "Interview complete.";
  }

  if (draft.step === "confirm") {
    return draft.draftProfile
      ? "Profile ready to confirm."
      : "Generate a profile before entering the product.";
  }

  return "";
}

function renderRankedGameCard(
  title: string,
  entry: RankedSeedGame | null,
  options: {
    emphasis?: "hero" | "card";
    primaryAction?: { label: string; action: string };
    secondaryActions?: Array<{ label: string; action: string }>;
    extraContent?: string;
  } = {},
) {
  if (!entry) {
    return `
      <section class="product-today-card product-card">
        <div class="product-section-head">
          <p class="product-eyebrow">${escapeHtml(title)}</p>
          <h2>Not enough signal yet</h2>
        </div>
        ${createEmptyState("This slot will fill once onboarding is complete and at least one recommendation is available.")}
      </section>
    `;
  }

  const cover = entry.game.coverPath
    ? `
      <div class="product-cover-shell">
        <img src="${escapeHtml(entry.game.coverPath)}" alt="${escapeHtml(entry.game.title)} cover art" loading="lazy" decoding="async">
      </div>
    `
    : "";
  const heroClass = options.emphasis === "hero" ? " product-today-hero" : "";

  return `
    <section class="product-today-card product-card${heroClass}">
      <div class="product-meta">Affinity ${entry.affinityScore} · Risk ${entry.riskScore} · ${escapeHtml(formatConfidence(entry.confidence))}</div>
      <div class="product-detail-layout">
        ${cover || '<div class="product-cover-shell"></div>'}
        <div class="product-grid">
          <div class="product-section-head">
            <p class="product-eyebrow">${escapeHtml(title)}</p>
            <h2>${escapeHtml(entry.game.title)}</h2>
            <p class="product-tagline">${escapeHtml(summarizeRankedGame(entry))}</p>
          </div>
          <div class="product-chip-list">
            ${renderChip(formatPlatformAvailability(entry), entry.platformAvailability === "unavailable" ? "negative" : "positive")}
            ${renderChip(formatOwnershipStatus(entry.ownershipStatus), entry.ownershipStatus === "owned" ? "positive" : entry.ownershipStatus === "unknown" ? "warning" : "negative")}
            ${renderChip(formatReleaseState(entry.game.releaseState), entry.game.releaseState === "unreleased" ? "warning" : "positive")}
            ${entry.game.source === "universe" ? renderChip("Universe seed", "warning") : ""}
          </div>
          <div class="product-grid">
            <div>
              <strong>Why it fits</strong>
              <ul>
                ${entry.fitReasons.length > 0 ? entry.fitReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("") : "<li>Signal is still shallow, but there is enough structure for a first estimate.</li>"}
              </ul>
            </div>
            <div>
              <strong>Watch-outs</strong>
              <ul>
                ${entry.cautionReasons.length > 0 ? entry.cautionReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("") : "<li>No major caution flags yet.</li>"}
              </ul>
            </div>
          </div>
          <div class="product-state-actions">
            ${
              options.primaryAction
                ? `<button class="product-button product-button-primary" data-action="${escapeHtml(options.primaryAction.action)}" data-game-id="${escapeHtml(entry.game.gameId)}">${escapeHtml(options.primaryAction.label)}</button>`
                : ""
            }
            ${
              options.secondaryActions?.map(
                (item) =>
                  `<button class="product-button product-button-secondary" data-action="${escapeHtml(item.action)}" data-game-id="${escapeHtml(entry.game.gameId)}">${escapeHtml(item.label)}</button>`,
              ).join("") ?? ""
            }
          </div>
          ${options.extraContent ?? ""}
        </div>
      </div>
    </section>
  `;
}

function renderAnchorSelector(
  label: string,
  kind: AnchorKind,
  query: string,
  selectedGameIds: string[],
  gamesById: Map<string, SeedGame>,
  results: SeedGame[],
  currentGameId: string | null,
) {
  const currentIds = kind === "current" ? (currentGameId ? [currentGameId] : []) : selectedGameIds;
  const selectedMarkup = currentIds.length
    ? currentIds
        .map((gameId) => {
          const game = gamesById.get(gameId);
          if (!game) {
            return "";
          }

          return `
            <span class="product-chip">
              ${escapeHtml(game.title)}
              <button type="button" class="product-pill-button" data-action="remove-anchor" data-kind="${kind}" data-game-id="${escapeHtml(gameId)}">Remove</button>
            </span>
          `;
        })
        .join("")
    : `<p class="product-empty">No picks yet.</p>`;

  return `
    <section class="product-anchor-card">
      <div class="product-grid">
        <div>
          <strong>${escapeHtml(label)}</strong>
          <p class="product-help">${
            kind === "liked"
              ? "These become the first positive anchors for your taste profile."
              : kind === "disliked"
                ? "These teach the product what tends to waste your time."
                : "Optional. If you already have a current run, this becomes the default focus in Today."
          }</p>
        </div>
        <label class="product-field">
          <span class="product-field-hint">Search title or series</span>
          <input class="product-input" type="search" data-field="anchor-search" data-kind="${kind}" value="${escapeHtml(query)}" placeholder="Type a game title">
        </label>
        <div class="product-chip-list">${selectedMarkup}</div>
        <div class="product-results-list">
          ${results
            .map(
              (game) => `
                <button
                  type="button"
                  class="product-result-card"
                  data-action="add-anchor"
                  data-kind="${kind}"
                  data-game-id="${escapeHtml(game.gameId)}"
                >
                  <div class="product-result-top">
                    <div>
                      <h3>${escapeHtml(game.title)}</h3>
                      <p class="product-meta">${escapeHtml(game.series || game.primaryGenre)}</p>
                    </div>
                    <span class="product-score">${escapeHtml(game.source === "universe" ? "Universe" : "Catalog")}</span>
                  </div>
                </button>
              `,
            )
            .join("")}
        </div>
      </div>
    </section>
  `;
}

export function createProductApp(
  root: HTMLElement,
  seedData: ProductSeedData,
  initialState: ProductState,
  runtimeMode: ProductRuntimeMode,
) {
  const state = cloneState(initialState);
  const finderIndex = buildFinderIndex(seedData.allGames);
  const ui: ProductUiState = {
    activeTab: state.user.onboardingCompletedAt ? "today" : "onboarding",
    onboardingSearch: {
      liked: "",
      disliked: "",
      current: "",
    },
    finderQuery: "",
    finderSelectedGameId: null,
    completionPickerGameId: null,
    dropPickerGameId: null,
    finderInsight: null,
    statusMessage: null,
  };

  async function persistState() {
    state.user.lastUpdatedAt = nowIso();
    await saveProductState(state);
  }

  function setStatusMessage(message: string | null) {
    ui.statusMessage = message;
  }

  function getSeedGame(gameId: string) {
    return seedData.gamesById.get(gameId) ?? null;
  }

  function updateGameState(
    gameId: string,
    updates: {
      status?: ProductGameStatus;
      sentiment?: ProductGameSentiment;
      ownershipStatus?: ProductOwnershipStatus;
      notes?: string;
      source?: "onboarding" | "finder" | "manual";
    },
  ) {
    const game = getSeedGame(gameId);
    if (!game) {
      return;
    }

    if (updates.status === "playing") {
      Object.entries(state.user.gameStates).forEach(([entryGameId, entry]) => {
        if (entry.status === "playing" && entryGameId !== gameId) {
          state.user.gameStates[entryGameId] = {
            ...entry,
            status: "on_hold",
            updatedAt: nowIso(),
          };
        }
      });
    }

    const existing = state.user.gameStates[gameId];
    const timestamp = nowIso();
    state.user.gameStates[gameId] = {
      gameId,
      title: game.title,
      source: updates.source ?? existing?.source ?? "manual",
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      sentiment: updates.sentiment ?? existing?.sentiment,
      status: updates.status ?? existing?.status,
      ownershipStatus: updates.ownershipStatus ?? existing?.ownershipStatus,
      notes: updates.notes ?? existing?.notes,
    };
  }

  function addFinderAction(gameId: string, action: "saved" | "dismissed" | "current_run" | "dropped" | "not_owned") {
    state.user.finderActions[gameId] = {
      gameId,
      action,
      createdAt: nowIso(),
    };
  }

  function closeCompletionPicker() {
    ui.completionPickerGameId = null;
  }

  function closeDropPicker() {
    ui.dropPickerGameId = null;
  }

  function renderCompletionPicker(gameId: string, sentiment?: ProductGameSentiment) {
    if (ui.completionPickerGameId !== gameId) {
      return "";
    }

    return `
      <div class="product-inline-picker">
        <div class="product-grid">
          <strong>How did it land?</strong>
          <p class="product-note">${
            sentiment
              ? `Current outcome: ${escapeHtml(formatCompletionOutcome(sentiment))}.`
              : "Choose the outcome that best matches the finished run."
          }</p>
        </div>
        <div class="product-actions">
          <button class="product-button product-button-primary" data-action="complete-game" data-game-id="${escapeHtml(gameId)}" data-sentiment="liked">Loved it</button>
          <button class="product-button product-button-secondary" data-action="complete-game" data-game-id="${escapeHtml(gameId)}" data-sentiment="mixed">Mixed</button>
          <button class="product-button product-button-ghost" data-action="complete-game" data-game-id="${escapeHtml(gameId)}" data-sentiment="disliked">Finished but not for me</button>
          <button class="product-button product-button-ghost" data-action="close-completion-picker" data-game-id="${escapeHtml(gameId)}">Cancel</button>
        </div>
      </div>
    `;
  }

  function renderDropPicker(gameId: string) {
    if (ui.dropPickerGameId !== gameId) {
      return "";
    }

    return `
      <div class="product-inline-picker">
        <div class="product-grid">
          <strong>Drop this run?</strong>
          <p class="product-note">This marks the game as started, stopped early, and a negative signal for future recommendations.</p>
        </div>
        <div class="product-actions">
          <button class="product-button product-button-primary" data-action="confirm-drop-run" data-game-id="${escapeHtml(gameId)}">Drop this run</button>
          <button class="product-button product-button-ghost" data-action="close-drop-picker" data-game-id="${escapeHtml(gameId)}">Cancel</button>
        </div>
      </div>
    `;
  }

  function getAnchorResults(kind: AnchorKind) {
    const query = ui.onboardingSearch[kind];
    const current = searchSeedGames(seedData.allGames, query, finderIndex);

    return current.slice(0, 8);
  }

  function renderOnboarding() {
    const draft = state.user.onboarding;
    const canAdvance = canAdvanceOnboarding(draft);
    const gateMessage = getOnboardingGateMessage(state);
    const steps = [
      ["platforms", "Platforms"],
      ["anchors", "Anchors"],
      ["interview", "Interview"],
      ["confirm", "Confirm"],
    ] as const;
    const stepPills = steps
      .map(
        ([step, label]) =>
          `<span class="product-chip ${draft.step === step ? "product-chip-positive" : ""}">${escapeHtml(label)}</span>`,
      )
      .join("");
    const platformRows = seedData.platforms
      .map((platform) => {
        const selection = draft.platforms.find((entry) => entry.platformId === platform.platformId);

        return `
          <article class="product-platform-card">
            <label>
              <span><strong>${escapeHtml(platform.displayName)}</strong></span>
              <span class="product-field-hint">${escapeHtml(platform.family)}</span>
              <select class="product-select" data-field="platform-status" data-platform-id="${escapeHtml(platform.platformId)}">
                <option value="">Not selected</option>
                <option value="available" ${selection?.status === "available" ? "selected" : ""}>Available now</option>
                <option value="limited" ${selection?.status === "limited" ? "selected" : ""}>Limited access</option>
                <option value="planned" ${selection?.status === "planned" ? "selected" : ""}>Planned</option>
              </select>
            </label>
          </article>
        `;
      })
      .join("");

    const likedResults = getAnchorResults("liked");
    const dislikedResults = getAnchorResults("disliked");
    const currentResults = getAnchorResults("current");
    let stepMarkup = "";

    if (draft.step === "platforms") {
      stepMarkup = `
        <div class="product-grid">
          <div class="product-step-head">
            <p class="product-eyebrow">Step 1</p>
            <h1>What can you play on right now?</h1>
            <p class="product-tagline">Platform access filters recommendations before taste scoring takes over.</p>
          </div>
          <div class="product-platform-grid">${platformRows}</div>
        </div>
      `;
    }

    if (draft.step === "anchors") {
      stepMarkup = `
        <div class="product-grid">
          <div class="product-step-head">
            <p class="product-eyebrow">Step 2</p>
            <h1>Give the system a few reliable taste anchors</h1>
            <p class="product-tagline">Three strong positives and three clear misses are enough for a first recommendation pass.</p>
          </div>
          <div class="product-anchor-grid">
            ${renderAnchorSelector("Loved or finished", "liked", ui.onboardingSearch.liked, draft.likedGameIds, seedData.gamesById, likedResults, draft.currentGameId)}
            ${renderAnchorSelector("Dropped or disliked", "disliked", ui.onboardingSearch.disliked, draft.dislikedGameIds, seedData.gamesById, dislikedResults, draft.currentGameId)}
            ${renderAnchorSelector("Current run", "current", ui.onboardingSearch.current, [], seedData.gamesById, currentResults, draft.currentGameId)}
          </div>
        </div>
      `;
    }

    if (draft.step === "interview") {
      const priorityChips = ONBOARDING_PRIORITY_CHIPS.map((chip) =>
        renderSelectableChip({
          action: "toggle-priority-chip",
          label: chip.label,
          selected: draft.answers.selectedPriorities.includes(chip.id),
          id: chip.id,
          group: "priority",
        }),
      ).join("");
      const frictionChips = ONBOARDING_FRICTION_CHIPS.map((chip) =>
        renderSelectableChip({
          action: "toggle-friction-chip",
          label: chip.label,
          selected: draft.answers.selectedFrictionSignals.includes(chip.id),
          id: chip.id,
          group: "friction",
        }),
      ).join("");
      const playPatternChips = ONBOARDING_PLAY_PATTERN_CHIPS.map((chip) =>
        renderSelectableChip({
          action: "select-play-pattern-chip",
          label: chip.label,
          selected: draft.answers.selectedPlayPattern === chip.id,
          id: chip.id,
          group: "pattern",
        }),
      ).join("");

      stepMarkup = `
        <div class="product-grid">
          <div class="product-step-head">
            <p class="product-eyebrow">Step 3</p>
            <h1>Explain your taste in plain language</h1>
            <p class="product-tagline">${
              runtimeMode === "ai-assisted"
                ? "Use the chips to define your taste fast, then add optional notes for AI-assisted interpretation."
                : "Use the chips to define your taste fast. In local-only mode, rules and structured signals drive the profile."
            }</p>
          </div>
          <div class="product-card-grid">
            <section class="product-card">
              <h3>What matters most</h3>
              <div class="product-chip-list">${priorityChips}</div>
            </section>
            <section class="product-card">
              <h3>What breaks momentum</h3>
              <div class="product-chip-list">${frictionChips}</div>
            </section>
            <section class="product-card">
              <h3>When a game stops working</h3>
              <div class="product-chip-list">${playPatternChips}</div>
            </section>
            <label class="product-field">
              <span>Optional note: what makes a game work for you?</span>
              <textarea class="product-textarea" data-field="interview-love" placeholder="Examples: strong story, quick momentum, clear objectives, emotional payoff">${escapeHtml(draft.answers.love)}</textarea>
            </label>
            <label class="product-field">
              <span>Optional note: what usually causes you to bounce?</span>
              <textarea class="product-textarea" data-field="interview-frustration" placeholder="Examples: repetitive combat, confusing systems, slow starts">${escapeHtml(draft.answers.frustration)}</textarea>
            </label>
            <label class="product-field">
              <span>Optional note: what matters most when you decide what to play next?</span>
              <textarea class="product-textarea" data-field="interview-priorities" placeholder="Examples: story over combat, progression over spectacle">${escapeHtml(draft.answers.priorities)}</textarea>
            </label>
            <label class="product-field">
              <span>Optional note: how do you behave when a game looks good but is not fully working?</span>
              <textarea class="product-textarea" data-field="interview-play-pattern" placeholder="Examples: I push through, I stop quickly, I switch to YouTube">${escapeHtml(draft.answers.playPattern)}</textarea>
            </label>
          </div>
        </div>
      `;
    }

    if (draft.step === "confirm") {
      const profile = draft.draftProfile;

      stepMarkup = profile
        ? `
            <div class="product-grid">
              <div class="product-step-head">
                <p class="product-eyebrow">Step 4</p>
                <h1>Confirm your starting taste profile</h1>
                <p class="product-tagline">${escapeHtml(profile.summary)}</p>
                <p class="product-note">${
                  runtimeMode === "ai-assisted"
                    ? "Draft generated with AI-assisted interpretation plus your structured onboarding chips."
                    : "Draft generated from structured onboarding chips and local deterministic rules."
                }</p>
              </div>
              <div class="product-card-grid">
                <section class="product-card">
                  <h3>What matters most</h3>
                  <div class="product-chip-list">
                    ${Object.entries(profile.priorities)
                      .map(([key, value]) => renderChip(`${key}: ${value}`))
                      .join("")}
                  </div>
                </section>
                <section class="product-card">
                  <h3>Watch-outs</h3>
                  <div class="product-chip-list">
                    ${Object.entries(profile.avoidPatterns)
                      .filter(([, value]) => value)
                      .map(([key]) => renderChip(key, "negative"))
                      .join("") || "<p class=\"product-empty\">No strong risk patterns extracted yet.</p>"}
                  </div>
                </section>
                <section class="product-card">
                  <h3>Signals extracted</h3>
                  <div class="product-grid">
                    ${profile.signals
                      .map(
                        (signal) => `
                          <article class="product-surface-card">
                            <strong>${escapeHtml(signal.label)}</strong>
                            <p class="product-help">${escapeHtml(signal.reason)}</p>
                          </article>
                        `,
                      )
                      .join("")}
                  </div>
                </section>
              </div>
              <div class="product-actions">
                <button class="product-button product-button-primary" data-action="confirm-profile">Enter the product</button>
                <button class="product-button product-button-secondary" data-action="generate-profile">Refresh profile</button>
              </div>
            </div>
          `
        : `
            <div class="product-grid">
              <div class="product-step-head">
                <p class="product-eyebrow">Step 4</p>
                <h1>Generate your first profile</h1>
                <p class="product-tagline">This uses the OpenAI proxy when available and falls back to a deterministic local builder when it is not.</p>
              </div>
              <div class="product-actions">
                <button class="product-button product-button-primary" data-action="generate-profile">Generate profile</button>
              </div>
            </div>
          `;
    }

    return `
      <section class="product-step-card">
        <div class="product-chip-list">${stepPills}</div>
        ${stepMarkup}
        <div class="product-actions">
          ${draft.step !== "platforms" ? '<button class="product-button product-button-ghost" data-action="prev-step">Back</button>' : ""}
          ${
            draft.step !== "confirm"
              ? `<button class="product-button product-button-primary" data-action="next-step" ${canAdvance ? "" : "disabled"}>Continue</button>`
              : ""
          }
        </div>
        ${
          draft.step !== "confirm"
            ? `<p class="product-note">${escapeHtml(gateMessage)}</p>`
            : ""
        }
      </section>
    `;
  }

  function renderToday() {
    const model: ProductTodayModel = buildTodayModel(
      seedData.allGames,
      state,
      state.user.profile,
      seedData.gamesById,
    );
    const hero = model.currentRun ?? model.nextUp;
    const heading = model.currentRun ? "Current run" : "Best next move";

    return `
      <section class="product-grid">
        ${renderRankedGameCard(heading, hero, {
          emphasis: "hero",
          primaryAction: model.currentRun
            ? { label: "Pause this run", action: "pause-run" }
            : hero
              ? { label: "Make this current run", action: "set-current-run" }
              : undefined,
          secondaryActions:
            model.currentRun
              ? [
                  { label: "Mark completed", action: "open-completion-picker" },
                  { label: "Drop this run", action: "open-drop-picker" },
                ]
              : hero
                ? [
                    { label: "Save for later", action: "mark-interested" },
                    { label: "Not for me", action: "dismiss-game" },
                  ]
                : [],
          extraContent:
            model.currentRun && hero
              ? `${renderCompletionPicker(
                  hero.game.gameId,
                  state.user.gameStates[hero.game.gameId]?.sentiment,
                )}${renderDropPicker(hero.game.gameId)}`
              : "",
        })}
        <div class="product-today-grid${model.currentRun ? "" : " product-today-grid-single"}">
          ${model.currentRun ? renderRankedGameCard("Next up", model.nextUp, {
            primaryAction: model.nextUp ? { label: "Save for later", action: "mark-interested" } : undefined,
            secondaryActions: model.nextUp ? [{ label: "Make current run", action: "set-current-run" }] : [],
          }) : ""}
          ${renderRankedGameCard("Wishlist fit", model.wishlistFit, {
            primaryAction: model.wishlistFit
              ? {
                  label: model.wishlistFit.ownershipStatus === "unknown" ? "I own this" : "Add to wishlist",
                  action: model.wishlistFit.ownershipStatus === "unknown" ? "mark-owned" : "mark-wishlist",
                }
              : undefined,
            secondaryActions:
              model.wishlistFit?.ownershipStatus === "unknown"
                ? [{ label: "Add to wishlist", action: "mark-wishlist" }]
                : [],
          })}
          ${renderRankedGameCard("Best playable alternative", model.playableAlternative, {
            primaryAction: model.playableAlternative ? { label: "Make current run", action: "set-current-run" } : undefined,
            secondaryActions: model.playableAlternative ? [{ label: "Save for later", action: "mark-interested" }] : [],
          })}
          ${renderRankedGameCard("Avoid for now", model.avoid, {
            primaryAction: model.avoid ? { label: "Not for me", action: "dismiss-game" } : undefined,
          })}
          ${renderRankedGameCard("Best resume", model.resume, {
            primaryAction: model.resume ? { label: "Resume this run", action: "set-current-run" } : undefined,
            secondaryActions: model.resume ? [{ label: "Drop this run", action: "open-drop-picker" }] : [],
            extraContent: model.resume ? renderDropPicker(model.resume.game.gameId) : "",
          })}
        </div>
      </section>
    `;
  }

  function renderFinder() {
    if (!state.user.profile) {
      return createEmptyState(
        "Finish onboarding first so the finder can score games against your actual taste profile.",
        "Open setup",
        "go-setup",
      );
    }

    const results = searchSeedGames(seedData.allGames, ui.finderQuery, finderIndex);
    const selectedGame =
      (ui.finderSelectedGameId ? getSeedGame(ui.finderSelectedGameId) : null) ??
      results[0] ??
      null;
    const selectedRanked = selectedGame
      ? scoreSeedGame(selectedGame, state, state.user.profile, seedData.gamesById)
      : null;
    const selectedGameState = selectedRanked
      ? state.user.gameStates[selectedRanked.game.gameId]
      : null;
    const localInsight = selectedRanked
      ? {
          summary: summarizeRankedGame(selectedRanked),
          fitReasons: selectedRanked.fitReasons,
          cautionReasons: selectedRanked.cautionReasons,
          confidence: selectedRanked.confidence,
        }
      : null;
    const activeInsight =
      ui.finderInsight && selectedGame && ui.finderInsight.gameId === selectedGame.gameId
        ? ui.finderInsight
        : null;

    return `
      <section class="product-finder-grid">
        <div class="product-panel product-grid">
          <div class="product-section-head">
            <p class="product-eyebrow">Game Finder</p>
            <h2>Search the catalog and the hidden universe</h2>
            <p class="product-tagline">${
              runtimeMode === "ai-assisted"
                ? "The finder uses deterministic scoring first, then lets you request an AI-assisted sharper read."
                : "The finder is running in local-only mode with deterministic reasoning based on profile chips, anchors, metadata, and platform access."
            }</p>
          </div>
          <label class="product-field">
            <span class="product-field-hint">Search title, series, or genre</span>
            <input class="product-input" type="search" data-field="finder-query" value="${escapeHtml(ui.finderQuery)}" placeholder="Search a game">
          </label>
          <div class="product-results-list">
            ${results
              .map((game) => {
                const ranked = scoreSeedGame(game, state, state.user.profile!, seedData.gamesById);
                const isSelected = selectedGame?.gameId === game.gameId;

                return `
                  <button type="button" class="product-result-card${isSelected ? " is-selected" : ""}" data-action="select-finder-result" data-game-id="${escapeHtml(game.gameId)}">
                    <div class="product-result-top">
                      <div>
                        <h3>${escapeHtml(game.title)}</h3>
                        <p class="product-meta">${escapeHtml(game.series || game.primaryGenre)}</p>
                      </div>
                      <div class="product-grid">
                        <span class="product-score">${ranked.affinityScore}</span>
                        <span class="product-meta">Risk ${ranked.riskScore}</span>
                      </div>
                    </div>
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
        <div class="product-detail-card product-grid">
          ${
            selectedRanked
              ? `
                <div class="product-detail-layout">
                  <div class="product-cover-shell">
                    ${
                      selectedRanked.game.coverPath
                        ? `<img src="${escapeHtml(selectedRanked.game.coverPath)}" alt="${escapeHtml(selectedRanked.game.title)} cover art" loading="lazy" decoding="async">`
                        : ""
                    }
                  </div>
                  <div class="product-grid">
                    <div class="product-section-head">
                      <p class="product-eyebrow">${escapeHtml(selectedRanked.game.source === "universe" ? "Universe seed" : "Catalog title")}</p>
                      <h2>${escapeHtml(selectedRanked.game.title)}</h2>
                      <p class="product-tagline">${escapeHtml(activeInsight?.insight?.summary ?? localInsight?.summary ?? "")}</p>
                    </div>
                    <div class="product-chip-list">
                      ${renderChip(`Affinity ${selectedRanked.affinityScore}`)}
                      ${renderChip(`Risk ${selectedRanked.riskScore}`, selectedRanked.riskScore >= 58 ? "negative" : "warning")}
                      ${renderChip(formatConfidence(activeInsight?.insight?.confidence ?? localInsight?.confidence ?? selectedRanked.confidence))}
                      ${renderChip(formatPlatformAvailability(selectedRanked), selectedRanked.platformAvailability === "unavailable" ? "negative" : "positive")}
                      ${renderChip(formatOwnershipStatus(selectedRanked.ownershipStatus), selectedRanked.ownershipStatus === "owned" ? "positive" : selectedRanked.ownershipStatus === "unknown" ? "warning" : "negative")}
                      ${renderChip(formatReleaseState(selectedRanked.game.releaseState), selectedRanked.game.releaseState === "unreleased" ? "warning" : "positive")}
                      ${
                        selectedGameState?.status === "dropped"
                          ? renderChip("Dropped early", "negative")
                          : ""
                      }
                      ${
                        selectedGameState?.status === "completed"
                          ? renderChip(
                              `Completed · ${formatCompletionOutcome(selectedGameState.sentiment)}`,
                              selectedGameState.sentiment === "liked"
                                ? "positive"
                                : selectedGameState.sentiment === "disliked"
                                  ? "negative"
                                  : "warning",
                            )
                          : ""
                      }
                    </div>
                    <div class="product-grid">
                      <div>
                        <strong>Why it might work</strong>
                        <ul>
                          ${(activeInsight?.insight?.fitReasons ?? localInsight?.fitReasons ?? [])
                            .map((reason) => `<li>${escapeHtml(reason)}</li>`)
                            .join("")}
                        </ul>
                      </div>
                      <div>
                        <strong>Why it might fail</strong>
                        <ul>
                          ${(activeInsight?.insight?.cautionReasons ?? localInsight?.cautionReasons ?? [])
                            .map((reason) => `<li>${escapeHtml(reason)}</li>`)
                            .join("")}
                        </ul>
                      </div>
                    </div>
                    <div class="product-meta-row">
                      <span class="product-meta">Platforms: ${escapeHtml(selectedRanked.game.availablePlatformNames.join(", ") || "Unknown")}</span>
                    </div>
                    <div class="product-state-actions">
                      ${
                        selectedRanked.game.releaseState === "released" &&
                        selectedRanked.ownershipStatus === "owned" &&
                        selectedGameState?.status === "playing"
                          ? `<button class="product-button product-button-primary" data-action="open-completion-picker" data-game-id="${escapeHtml(selectedRanked.game.gameId)}">Mark completed</button>`
                          : selectedRanked.game.releaseState === "released" &&
                              selectedRanked.ownershipStatus === "owned" &&
                              selectedGameState?.status === "completed"
                            ? `<button class="product-button product-button-primary" data-action="open-completion-picker" data-game-id="${escapeHtml(selectedRanked.game.gameId)}">Update completion</button>`
                            : selectedRanked.game.releaseState === "released" &&
                                selectedRanked.ownershipStatus === "owned" &&
                                selectedGameState?.status === "dropped"
                              ? `<button class="product-button product-button-primary" data-action="retry-dropped-run" data-game-id="${escapeHtml(selectedRanked.game.gameId)}">Retry this run</button>`
                              : selectedRanked.game.releaseState === "released" && selectedRanked.ownershipStatus === "owned"
                              ? `<button class="product-button product-button-primary" data-action="set-current-run" data-game-id="${escapeHtml(selectedRanked.game.gameId)}">Make current run</button>`
                              : ""
                      }
                      ${
                        selectedRanked.game.releaseState === "released" &&
                        selectedRanked.ownershipStatus === "owned" &&
                        (selectedGameState?.status === "playing" || selectedGameState?.status === "on_hold")
                          ? `<button class="product-button product-button-secondary" data-action="pause-run" data-game-id="${escapeHtml(selectedRanked.game.gameId)}">Pause this run</button>`
                          : selectedRanked.game.releaseState === "released" &&
                              selectedRanked.ownershipStatus === "owned" &&
                              selectedGameState?.status === "dropped"
                            ? `<button class="product-button product-button-secondary" data-action="mark-interested" data-game-id="${escapeHtml(selectedRanked.game.gameId)}">Save for later</button>`
                          : ""
                      }
                      ${
                        selectedRanked.game.releaseState === "released" &&
                        selectedRanked.ownershipStatus === "owned" &&
                        (selectedGameState?.status === "playing" || selectedGameState?.status === "on_hold")
                          ? `<button class="product-button product-button-secondary" data-action="open-drop-picker" data-game-id="${escapeHtml(selectedRanked.game.gameId)}">Drop this run</button>`
                          : ""
                      }
                      ${
                        selectedRanked.game.releaseState === "unreleased"
                          ? `<button class="product-button product-button-secondary" data-action="track-release" data-game-id="${escapeHtml(selectedRanked.game.gameId)}">Track release</button>`
                          : selectedRanked.ownershipStatus === "owned" &&
                              selectedGameState?.status !== "completed" &&
                              selectedGameState?.status !== "dropped"
                            ? `<button class="product-button product-button-secondary" data-action="mark-interested" data-game-id="${escapeHtml(selectedRanked.game.gameId)}">Save for later</button>`
                            : selectedRanked.ownershipStatus !== "owned"
                              ? `<button class="product-button product-button-secondary" data-action="mark-wishlist" data-game-id="${escapeHtml(selectedRanked.game.gameId)}">Add to wishlist</button>`
                              : ""
                      }
                      ${
                        selectedRanked.game.releaseState === "released" && selectedRanked.ownershipStatus !== "owned"
                          ? `<button class="product-button product-button-ghost" data-action="mark-owned" data-game-id="${escapeHtml(selectedRanked.game.gameId)}">I own this</button>`
                          : ""
                      }
                      ${
                        selectedRanked.game.releaseState === "released" &&
                        selectedRanked.ownershipStatus !== "not_owned" &&
                        selectedGameState?.status !== "playing" &&
                        selectedGameState?.status !== "on_hold"
                          ? `<button class="product-button product-button-ghost" data-action="mark-not-owned" data-game-id="${escapeHtml(selectedRanked.game.gameId)}">I don't own this</button>`
                          : ""
                      }
                      ${
                        selectedGameState?.status !== "completed"
                          ? `<button class="product-button product-button-ghost" data-action="dismiss-game" data-game-id="${escapeHtml(selectedRanked.game.gameId)}">Not for me</button>`
                          : ""
                      }
                      ${
                        runtimeMode === "ai-assisted" && selectedRanked.game.releaseState === "released"
                          ? `<button class="product-button product-button-ghost" data-action="request-finder-insight" data-game-id="${escapeHtml(selectedRanked.game.gameId)}">${activeInsight?.status === "loading" ? "Thinking..." : "Ask AI for a sharper read"}</button>`
                          : ""
                      }
                    </div>
                    ${renderCompletionPicker(selectedRanked.game.gameId, selectedGameState?.sentiment)}
                    ${renderDropPicker(selectedRanked.game.gameId)}
                    ${
                      runtimeMode === "local-only"
                        ? `<p class="product-note">AI assist is unavailable right now. This read is coming from local deterministic rules.</p>`
                        : ""
                    }
                    ${
                      activeInsight?.status === "error"
                        ? `<p class="product-note">${escapeHtml(activeInsight.error ?? "The AI proxy is not available. Local reasoning is still shown above.")}</p>`
                        : ""
                    }
                  </div>
                </div>
              `
              : createEmptyState("No results yet. Try a different title or series.")
          }
        </div>
      </section>
    `;
  }

  function render() {
    const focusSnapshot = captureFocusSnapshot(root);
    const availableTabs: ProductTab[] = state.user.onboardingCompletedAt
      ? ["today", "finder", "onboarding"]
      : ["onboarding"];
    const tabLabel: Record<ProductTab, string> = {
      onboarding: "Setup",
      today: "Today",
      finder: "Finder",
    };

    root.innerHTML = `
      <main class="product-app-shell">
        <header class="product-header">
          <div class="product-brand">
            <span class="product-eyebrow">Games Taste Engine</span>
            <strong>Local-first MVP</strong>
            <span class="product-tab-hint">Guided onboarding, deterministic recommendations, and mode-aware interpretation.</span>
          </div>
          <div class="product-chip-list">
            ${renderChip(runtimeMode === "ai-assisted" ? "AI-assisted mode" : "Local-only mode", runtimeMode === "ai-assisted" ? "positive" : "warning")}
          </div>
          <nav class="product-tabs" aria-label="Product sections">
            ${availableTabs
              .map(
                (tab) => `
                  <button class="product-tab${ui.activeTab === tab ? " is-active" : ""}" data-action="switch-tab" data-tab="${tab}">
                    ${tabLabel[tab]}
                  </button>
                `,
              )
              .join("")}
          </nav>
        </header>
        ${
          ui.statusMessage
            ? `<section class="product-card"><p class="product-note">${escapeHtml(ui.statusMessage)}</p></section>`
            : ""
        }
        ${
          ui.activeTab === "onboarding"
            ? `<section class="product-onboarding-shell">${renderOnboarding()}</section>`
            : ui.activeTab === "today"
              ? renderToday()
              : renderFinder()
        }
        <section class="product-card">
          <div class="product-actions">
            <button class="product-button product-button-ghost" data-action="reset-local-product">Reset local product data</button>
          </div>
        </section>
      </main>
    `;

    restoreFocusSnapshot(root, focusSnapshot);
  }

  async function handleGenerateProfile() {
    const draft = state.user.onboarding;
    const likedGames = draft.likedGameIds
      .map((gameId) => getSeedGame(gameId))
      .filter((game): game is SeedGame => Boolean(game));
    const dislikedGames = draft.dislikedGameIds
      .map((gameId) => getSeedGame(gameId))
      .filter((game): game is SeedGame => Boolean(game));
    const currentGame = draft.currentGameId ? getSeedGame(draft.currentGameId) : null;

    try {
      const profile = await requestOnboardingProfile({
        likedGames,
        dislikedGames,
        currentGame,
        answers: draft.answers,
      });
      state.user.onboarding.draftProfile = profile;
      setStatusMessage("Profile generated through the AI proxy.");
    } catch (error) {
      state.user.onboarding.draftProfile = buildFallbackProfile(draft, seedData.gamesById);
      setStatusMessage(
        error instanceof Error
          ? `${error.message} Falling back to the local profile builder.`
          : "The AI proxy is unavailable. Falling back to the local profile builder.",
      );
    }

    await persistState();
    render();
  }

  async function finalizeOnboarding() {
    const draftProfile = state.user.onboarding.draftProfile;

    if (!draftProfile) {
      setStatusMessage("Generate a profile before entering the product.");
      render();
      return;
    }

    state.user.profile = draftProfile;
    state.user.onboardingCompletedAt = nowIso();

    state.user.onboarding.likedGameIds.forEach((gameId) => {
      updateGameState(gameId, {
        sentiment: "liked",
        ownershipStatus: "owned",
        source: "onboarding",
      });
    });
    state.user.onboarding.dislikedGameIds.forEach((gameId) => {
      updateGameState(gameId, {
        sentiment: "disliked",
        ownershipStatus: "owned",
        source: "onboarding",
      });
    });

    if (state.user.onboarding.currentGameId) {
      updateGameState(state.user.onboarding.currentGameId, {
        status: "playing",
        ownershipStatus: "owned",
        source: "onboarding",
      });
    }

    ui.activeTab = "today";
    setStatusMessage("Onboarding complete. The product is now using your local profile state.");
    await persistState();
    render();
  }

  root.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      return;
    }

    const field = target.dataset.field;
    if (field === "anchor-search" && target instanceof HTMLInputElement) {
      const kind = target.dataset.kind as AnchorKind | undefined;

      if (!kind) {
        return;
      }

      ui.onboardingSearch[kind] = target.value;
      render();
      return;
    }

    if (field === "finder-query" && target instanceof HTMLInputElement) {
      ui.finderQuery = target.value;
      ui.finderSelectedGameId = null;
      closeCompletionPicker();
      closeDropPicker();
      ui.finderInsight = null;
      render();
      return;
    }

    if (field === "interview-love") {
      state.user.onboarding.answers.love = target.value;
      void persistState();
      render();
      return;
    }

    if (field === "interview-frustration") {
      state.user.onboarding.answers.frustration = target.value;
      void persistState();
      render();
      return;
    }

    if (field === "interview-priorities") {
      state.user.onboarding.answers.priorities = target.value;
      void persistState();
      render();
      return;
    }

    if (field === "interview-play-pattern") {
      state.user.onboarding.answers.playPattern = target.value;
      void persistState();
      render();
    }
  });

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    if (target.dataset.field === "platform-status") {
      const platformId = target.dataset.platformId;

      if (!platformId) {
        return;
      }

      state.user.onboarding.platforms = state.user.onboarding.platforms.filter(
        (entry) => entry.platformId !== platformId,
      );

      if (target.value) {
        state.user.onboarding.platforms.push({
          platformId,
          status: target.value as "available" | "limited" | "planned",
        });
      }

      void persistState();
      render();
    }
  });

  root.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest<HTMLElement>("[data-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.action;
    const gameId = button.dataset.gameId ?? null;
    const chipId = button.dataset.chipId ?? null;

    if (action === "toggle-priority-chip" && chipId) {
      const selected = state.user.onboarding.answers.selectedPriorities;
      state.user.onboarding.answers.selectedPriorities = selected.includes(chipId)
        ? selected.filter((entry) => entry !== chipId)
        : [...selected, chipId];
      await persistState();
      render();
      return;
    }

    if (action === "toggle-friction-chip" && chipId) {
      const selected = state.user.onboarding.answers.selectedFrictionSignals;
      state.user.onboarding.answers.selectedFrictionSignals = selected.includes(chipId)
        ? selected.filter((entry) => entry !== chipId)
        : [...selected, chipId];
      await persistState();
      render();
      return;
    }

    if (action === "select-play-pattern-chip" && chipId) {
      state.user.onboarding.answers.selectedPlayPattern = chipId;
      await persistState();
      render();
      return;
    }

    if (action === "switch-tab") {
      const tab = button.dataset.tab as ProductTab | undefined;
      if (tab) {
        ui.activeTab = tab;
        closeCompletionPicker();
        closeDropPicker();
        setStatusMessage(null);
        render();
      }
      return;
    }

    if (action === "next-step") {
      if (!canAdvanceOnboarding(state.user.onboarding)) {
        setStatusMessage("Complete the current step before moving on.");
        render();
        return;
      }

      state.user.onboarding.step = nextOnboardingStep(state.user.onboarding.step);
      setStatusMessage(null);
      await persistState();
      render();
      return;
    }

    if (action === "prev-step") {
      const stepOrder = ["platforms", "anchors", "interview", "confirm"] as const;
      const currentIndex = stepOrder.indexOf(state.user.onboarding.step);
      state.user.onboarding.step = stepOrder[Math.max(0, currentIndex - 1)];
      setStatusMessage(null);
      await persistState();
      render();
      return;
    }

    if (action === "add-anchor" && gameId) {
      const kind = button.dataset.kind as AnchorKind | undefined;
      if (!kind) {
        return;
      }

      if (kind === "liked") {
        state.user.onboarding.likedGameIds = [
          ...new Set([...state.user.onboarding.likedGameIds, gameId]),
        ].slice(0, 3);
      } else if (kind === "disliked") {
        state.user.onboarding.dislikedGameIds = [
          ...new Set([...state.user.onboarding.dislikedGameIds, gameId]),
        ].slice(0, 3);
      } else {
        state.user.onboarding.currentGameId = gameId;
      }

      await persistState();
      render();
      return;
    }

    if (action === "remove-anchor" && gameId) {
      const kind = button.dataset.kind as AnchorKind | undefined;
      if (!kind) {
        return;
      }

      if (kind === "liked") {
        state.user.onboarding.likedGameIds = state.user.onboarding.likedGameIds.filter(
          (entry) => entry !== gameId,
        );
      } else if (kind === "disliked") {
        state.user.onboarding.dislikedGameIds = state.user.onboarding.dislikedGameIds.filter(
          (entry) => entry !== gameId,
        );
      } else if (state.user.onboarding.currentGameId === gameId) {
        state.user.onboarding.currentGameId = null;
      }

      await persistState();
      render();
      return;
    }

    if (action === "generate-profile") {
      await handleGenerateProfile();
      return;
    }

    if (action === "confirm-profile") {
      await finalizeOnboarding();
      return;
    }

    if (action === "go-setup") {
      ui.activeTab = "onboarding";
      render();
      return;
    }

    if (action === "select-finder-result" && gameId) {
      ui.finderSelectedGameId = gameId;
      closeCompletionPicker();
      closeDropPicker();
      ui.finderInsight = null;
      render();
      return;
    }

    if (action === "request-finder-insight" && gameId) {
      const game = getSeedGame(gameId);
      if (!game || !state.user.profile) {
        return;
      }

      ui.finderInsight = {
        gameId,
        status: "loading",
      };
      render();

      try {
        const insight = await requestFinderInsight({
          game,
          profile: state.user.profile,
        });
        ui.finderInsight = {
          gameId,
          status: "ready",
          insight,
        };
      } catch (error) {
        ui.finderInsight = {
          gameId,
          status: "error",
          error:
            error instanceof Error
              ? error.message
              : "The AI proxy is unavailable. Local explanation remains visible.",
        };
      }

      render();
      return;
    }

    if (gameId && action === "set-current-run") {
      const game = getSeedGame(gameId);
      if (!game || game.releaseState !== "released") {
        setStatusMessage("Unreleased titles cannot become the current run.");
        render();
        return;
      }

      updateGameState(gameId, {
        status: "playing",
        ownershipStatus: "owned",
        source: "finder",
      });
      closeCompletionPicker();
      closeDropPicker();
      addFinderAction(gameId, "current_run");
      setStatusMessage("Current run updated. Any previous active run was moved to on hold.");
      await persistState();
      render();
      return;
    }

    if (gameId && action === "open-completion-picker") {
      const game = getSeedGame(gameId);
      const gameState = state.user.gameStates[gameId];

      if (!game || game.releaseState !== "released" || gameState?.ownershipStatus !== "owned") {
        setStatusMessage("Only released and owned games can be marked as completed.");
        render();
        return;
      }

      ui.completionPickerGameId = ui.completionPickerGameId === gameId ? null : gameId;
      closeDropPicker();
      setStatusMessage(null);
      render();
      return;
    }

    if (action === "close-completion-picker") {
      closeCompletionPicker();
      render();
      return;
    }

    if (gameId && action === "open-drop-picker") {
      const game = getSeedGame(gameId);
      const gameState = state.user.gameStates[gameId];

      if (
        !game ||
        game.releaseState !== "released" ||
        gameState?.ownershipStatus !== "owned" ||
        (gameState?.status !== "playing" && gameState?.status !== "on_hold")
      ) {
        setStatusMessage("Only started owned runs can be dropped.");
        render();
        return;
      }

      ui.dropPickerGameId = ui.dropPickerGameId === gameId ? null : gameId;
      closeCompletionPicker();
      setStatusMessage(null);
      render();
      return;
    }

    if (action === "close-drop-picker") {
      closeDropPicker();
      render();
      return;
    }

    if (gameId && action === "complete-game") {
      const game = getSeedGame(gameId);
      const sentiment = button.dataset.sentiment as ProductGameSentiment | undefined;

      if (!game || game.releaseState !== "released" || !sentiment) {
        setStatusMessage("This game cannot be completed from the current state.");
        render();
        return;
      }

      updateGameState(gameId, {
        status: "completed",
        sentiment,
        ownershipStatus: "owned",
      });
      closeCompletionPicker();
      closeDropPicker();
      setStatusMessage(
        sentiment === "liked"
          ? "Run marked as completed. It now counts as a strong positive signal."
          : sentiment === "disliked"
            ? "Run marked as completed and not for you. Today refreshed."
            : "Run marked as completed with a mixed outcome. Today refreshed.",
      );
      await persistState();
      render();
      return;
    }

    if (gameId && action === "confirm-drop-run") {
      const game = getSeedGame(gameId);

      if (!game || game.releaseState !== "released") {
        setStatusMessage("This game cannot be dropped from the current state.");
        render();
        return;
      }

      updateGameState(gameId, {
        status: "dropped",
        sentiment: "disliked",
        ownershipStatus: "owned",
      });
      closeCompletionPicker();
      closeDropPicker();
      addFinderAction(gameId, "dropped");
      setStatusMessage("Run dropped early. Today refreshed and future recommendations will treat it as a negative signal.");
      await persistState();
      render();
      return;
    }

    if (gameId && action === "retry-dropped-run") {
      const game = getSeedGame(gameId);

      if (!game || game.releaseState !== "released") {
        setStatusMessage("This game cannot be retried right now.");
        render();
        return;
      }

      updateGameState(gameId, {
        status: "playing",
        ownershipStatus: "owned",
        source: "finder",
      });
      closeCompletionPicker();
      closeDropPicker();
      addFinderAction(gameId, "current_run");
      setStatusMessage("Dropped run restored as the current run.");
      await persistState();
      render();
      return;
    }

    if (gameId && action === "mark-interested") {
      updateGameState(gameId, {
        status: "interested",
        ownershipStatus: "owned",
        source: "finder",
      });
      closeCompletionPicker();
      closeDropPicker();
      addFinderAction(gameId, "saved");
      setStatusMessage("Saved for later.");
      await persistState();
      render();
      return;
    }

    if (gameId && action === "mark-wishlist") {
      updateGameState(gameId, {
        ownershipStatus: "wishlist",
        source: "finder",
      });
      closeCompletionPicker();
      closeDropPicker();
      addFinderAction(gameId, "saved");
      setStatusMessage("Added to wishlist.");
      await persistState();
      render();
      return;
    }

    if (gameId && action === "mark-owned") {
      updateGameState(gameId, {
        ownershipStatus: "owned",
        source: "finder",
      });
      closeCompletionPicker();
      closeDropPicker();
      setStatusMessage("Marked as owned and now eligible for Today.");
      await persistState();
      render();
      return;
    }

    if (gameId && action === "mark-not-owned") {
      updateGameState(gameId, {
        ownershipStatus: "not_owned",
        source: "finder",
      });
      closeCompletionPicker();
      closeDropPicker();
      addFinderAction(gameId, "not_owned");
      setStatusMessage("Marked as not owned. The title can still appear as a wishlist fit, but not as a playable-now recommendation.");
      await persistState();
      render();
      return;
    }

    if (gameId && action === "track-release") {
      updateGameState(gameId, {
        ownershipStatus: "wishlist",
        source: "finder",
      });
      closeCompletionPicker();
      closeDropPicker();
      addFinderAction(gameId, "saved");
      setStatusMessage("Release tracking saved.");
      await persistState();
      render();
      return;
    }

    if (gameId && action === "dismiss-game") {
      updateGameState(gameId, {
        status: "dismissed",
        source: "finder",
      });
      closeCompletionPicker();
      closeDropPicker();
      addFinderAction(gameId, "dismissed");
      setStatusMessage("Marked as not for me.");
      await persistState();
      render();
      return;
    }

    if (gameId && action === "pause-run") {
      updateGameState(gameId, {
        status: "on_hold",
        source: "manual",
      });
      closeCompletionPicker();
      closeDropPicker();
      setStatusMessage("Current run moved to on hold.");
      await persistState();
      render();
      return;
    }

    if (action === "reset-local-product") {
      await resetProductState();
      const freshState = createInitialState();
      Object.assign(state, freshState);
      ui.activeTab = "onboarding";
      ui.finderQuery = "";
      ui.finderSelectedGameId = null;
      closeCompletionPicker();
      closeDropPicker();
      ui.finderInsight = null;
      setStatusMessage("Local product data reset.");
      render();
    }
  });

  render();
}
