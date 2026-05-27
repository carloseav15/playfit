import {
  requestFinderInsight,
  requestOnboardingProfile,
} from "./ai/client";
import {
  buildFallbackProfile,
  canAdvanceOnboarding,
  hasRequiredAnchorDetails,
  nextOnboardingStep,
  ONBOARDING_ANCHOR_REASON_CHIPS,
  ONBOARDING_FRICTION_CHIPS,
  ONBOARDING_PLAY_PATTERN_CHIPS,
  ONBOARDING_PRIORITY_CHIPS,
} from "./domain/onboarding";
import {
  buildFinderIndex,
  buildTodayModel,
  findExactSeedGame,
  scoreSeedGame,
  searchSeedGames,
} from "./domain/recommendations";
import { createInitialState, saveProductState, resetProductState } from "./store/indexed-db";
import type {
  FinderInsight,
  ProductAnchorReason,
  ProductConfidence,
  ProductGameSentiment,
  ProductGameStatus,
  ProductOwnershipStatus,
  ProductProfile,
  ProductSeedData,
  ProductRuntimeMode,
  ProductState,
  ProductTodayModel,
  RankedSeedGame,
  SeedGame,
} from "./types";

type ProductTab = "onboarding" | "today" | "finder" | "library" | "profile" | "upcoming";
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
  historyQuery: string;
  historySelectedGameId: string | null;
  libraryEditGameId: string | null;
  dossierGameId: string | null;
  dossierReturnTab: ProductTab | null;
  statusMessage: string | null;
  startBannerDismissed: boolean;
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
      return "Mixed feelings";
    case "disliked":
      return "Didn't click";
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
    return "Promising, but still worth validating with a short first session.";
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

function renderChip(label: string, tone: "positive" | "negative" | "warning" | "neutral" = "positive") {
  const cls = tone === "neutral" ? "product-chip" : `product-chip product-chip-${tone}`;
  return `<span class="${cls}">${escapeHtml(label)}</span>`;
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
      ? "Looking good — you're ready to continue."
      : "Pick at least one platform to move on.";
  }

  if (draft.step === "anchors") {
    const likedLeft = Math.max(0, 3 - draft.likedGameIds.length);
    const dislikedLeft = Math.max(0, 3 - draft.dislikedGameIds.length);
    if (likedLeft === 0 && dislikedLeft === 0) {
      return hasRequiredAnchorDetails(draft)
        ? "Great — that's enough to get started."
        : "Add at least one reason and access status for each selected game.";
    }
    const parts = [];
    if (likedLeft > 0) parts.push(`${likedLeft} more game${likedLeft === 1 ? "" : "s"} you loved`);
    if (dislikedLeft > 0) parts.push(`${dislikedLeft} more that didn't click`);
    return `Add ${parts.join(" and ")} to continue.`;
  }

  if (draft.step === "interview") {
    const missing = [
      draft.answers.selectedPriorities.length === 0 ? "what you care about" : null,
      draft.answers.selectedFrictionSignals.length === 0 ? "what kills the vibe" : null,
      !draft.answers.selectedPlayPattern ? "your play style" : null,
    ].filter(Boolean);

    return missing.length > 0
      ? `Still need: ${missing.join(", ")}.`
      : "All done — ready to continue.";
  }

  if (draft.step === "confirm") {
    return draft.draftProfile
      ? "Your profile is ready."
      : "Hit the button above to build your profile.";
  }

  return "";
}

function affinityLabel(score: number, confidence?: ProductConfidence): string {
  if (score >= 78) return confidence === "low" ? "Promising" : "Very likely fit";
  if (score >= 62) return "Promising";
  if (score >= 45) return "Still learning";
  return "Weak signal";
}

function riskLabel(score: number): string {
  if (score >= 58) return "Risky for your taste";
  if (score >= 35) return "Some friction";
  return "Low risk";
}

type StatusTone = "positive" | "negative" | "warning" | "neutral" | "accent";

type ProductCardAction = {
  label: string;
  action: string;
};

type RankedGameCardOptions = {
  emphasis?: "hero" | "card";
  primaryAction?: ProductCardAction;
  secondaryActions?: ProductCardAction[];
  extraContent?: string;
};

function getCoverInitials(game: SeedGame) {
  const words = game.title.split(" ").filter((word) => word && !/^\d/.test(word));
  return (words.length > 0 ? words : game.title.split(" ").filter(Boolean))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

function renderCoverArt(game: SeedGame, variant: "hero" | "dossier" | "thumb" = "dossier") {
  const fallbackTitle = variant === "thumb"
    ? ""
    : `<small>${escapeHtml(game.title)}</small>`;
  return `
    <div class="product-cover-shell product-cover-${variant}">
      ${
        game.coverPath
          ? `<img src="${escapeHtml(game.coverPath)}" alt="${escapeHtml(game.title)} cover art" loading="lazy" decoding="async">`
          : `<span class="product-cover-initials product-cover-fallback"><strong>${escapeHtml(getCoverInitials(game))}</strong>${fallbackTitle}<em>${escapeHtml(game.primaryGenre.replaceAll("_", " "))}</em></span>`
      }
    </div>
  `;
}

function getDecisionTone(entry: RankedSeedGame): StatusTone {
  if (entry.riskScore >= 58) return "negative";
  if (entry.affinityScore >= 78 && entry.riskScore <= 35) return "positive";
  if (entry.affinityScore >= 62) return "accent";
  return "warning";
}

function getDecisionLabel(entry: RankedSeedGame) {
  if (entry.riskScore >= 58) return "Risky for your taste";
  return affinityLabel(entry.affinityScore, entry.confidence);
}

function getPrimaryReason(entry: RankedSeedGame) {
  if (entry.riskScore >= 58 && entry.cautionReasons.length > 0) {
    return entry.cautionReasons[0];
  }

  if (entry.fitReasons.length > 0) {
    return entry.fitReasons[0];
  }

  return summarizeRankedGame(entry);
}

function renderStatusBadge(label: string, tone: StatusTone = "neutral", extraClass = "") {
  const suffix = extraClass ? ` ${extraClass}` : "";
  return `<span class="product-status-badge product-status-${tone}${suffix}">${escapeHtml(label)}</span>`;
}

function renderMetricStrip(entry: RankedSeedGame) {
  return `
    <div class="product-metric-strip" aria-label="Recommendation metrics">
      <div class="product-metric">
        <span>Fit</span>
        <strong>${entry.affinityScore}</strong>
      </div>
      <div class="product-metric">
        <span>Risk</span>
        <strong>${entry.riskScore}</strong>
      </div>
      <div class="product-metric">
        <span>Confidence</span>
        <strong>${escapeHtml(entry.confidence)}</strong>
      </div>
    </div>
  `;
}

function renderActionButtons(
  gameId: string,
  primaryAction?: ProductCardAction,
  secondaryActions: ProductCardAction[] = [],
) {
  const primary = primaryAction
    ? `<button class="product-button product-button-primary" data-action="${escapeHtml(primaryAction.action)}" data-game-id="${escapeHtml(gameId)}">${escapeHtml(primaryAction.label)}</button>`
    : "";
  const secondary = secondaryActions
    .map((item) => `<button class="product-button product-button-secondary" data-action="${escapeHtml(item.action)}" data-game-id="${escapeHtml(gameId)}">${escapeHtml(item.label)}</button>`)
    .join("");

  return primary || secondary
    ? `<div class="product-state-actions">${primary}${secondary}</div>`
    : "";
}

function renderReasonsBlock(entry: RankedSeedGame, options: { fitTitle?: string; cautionTitle?: string } = {}) {
  return `
    <div class="product-reason-grid">
      <div class="product-reason-panel">
        <strong>${escapeHtml(options.fitTitle ?? "Why this could work")}</strong>
        <ul>
          ${entry.fitReasons.length > 0 ? entry.fitReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("") : "<li>Still learning from your library and onboarding picks.</li>"}
        </ul>
      </div>
      <div class="product-reason-panel">
        <strong>${escapeHtml(options.cautionTitle ?? "Watch-outs")}</strong>
        <ul>
          ${entry.cautionReasons.length > 0 ? entry.cautionReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("") : "<li>No major friction flagged by the local profile.</li>"}
        </ul>
      </div>
    </div>
  `;
}

function renderGameDossier(
  title: string,
  entry: RankedSeedGame,
  options: RankedGameCardOptions & {
    summary?: string;
    detailMeta?: string;
    compact?: boolean;
  } = {},
) {
  const statusTone = getDecisionTone(entry);
  const summary = options.summary ?? summarizeRankedGame(entry);
  const compactClass = options.compact ? " product-dossier-compact" : "";

  return `
    <section class="product-dossier${compactClass}">
      <div class="product-dossier-layout">
        ${renderCoverArt(entry.game, options.compact ? "thumb" : "dossier")}
        <div class="product-dossier-main">
          <div class="product-dossier-head">
            <p class="product-eyebrow">${escapeHtml(title)}</p>
            <div class="product-dossier-title-row">
              <h2>${escapeHtml(entry.game.title)}</h2>
              ${renderStatusBadge(getDecisionLabel(entry), statusTone)}
            </div>
            <p class="product-tagline">${escapeHtml(summary)}</p>
          </div>
          <div class="product-chip-list product-chip-list-tight">
            ${renderStatusBadge(riskLabel(entry.riskScore), entry.riskScore >= 58 ? "negative" : entry.riskScore >= 35 ? "warning" : "positive")}
            ${renderStatusBadge(formatConfidence(entry.confidence), entry.confidence === "high" ? "positive" : entry.confidence === "medium" ? "accent" : "warning")}
            ${renderStatusBadge(formatPlatformAvailability(entry), entry.platformAvailability === "unavailable" ? "negative" : entry.platformAvailability === "available" ? "positive" : "warning")}
            ${renderStatusBadge(formatOwnershipStatus(entry.ownershipStatus), entry.ownershipStatus === "owned" ? "positive" : entry.ownershipStatus === "wishlist" ? "accent" : entry.ownershipStatus === "not_owned" ? "neutral" : "warning")}
            ${renderStatusBadge(formatReleaseState(entry.game.releaseState), entry.game.releaseState === "unreleased" ? "warning" : "positive")}
          </div>
          ${options.compact ? `<p class="product-primary-reason">${escapeHtml(getPrimaryReason(entry))}</p>` : renderMetricStrip(entry)}
          ${options.compact ? "" : renderReasonsBlock(entry)}
          ${options.detailMeta ? `<p class="product-meta">${escapeHtml(options.detailMeta)}</p>` : ""}
          ${renderActionButtons(entry.game.gameId, options.primaryAction, options.secondaryActions)}
          ${options.extraContent ?? ""}
        </div>
      </div>
    </section>
  `;
}

function renderDecisionHero(
  title: string,
  entry: RankedSeedGame | null,
  options: RankedGameCardOptions = {},
) {
  if (!entry) {
    return `
      <section class="product-decision-hero product-dossier product-dossier-hero">
        <div class="product-dossier-main">
          <p class="product-eyebrow">${escapeHtml(title)}</p>
          <h1>Nothing ready yet</h1>
          ${createEmptyState("Log a few games you've already played and the engine will start making recommendations.")}
        </div>
      </section>
    `;
  }

  const statusTone = getDecisionTone(entry);

  return `
    <section class="product-decision-hero product-dossier product-dossier-hero">
      <div class="product-decision-copy">
        <p class="product-eyebrow">${escapeHtml(title)}</p>
        <div class="product-decision-label-row">
          ${renderStatusBadge(getDecisionLabel(entry), statusTone, "product-status-large")}
          ${renderStatusBadge(formatConfidence(entry.confidence), entry.confidence === "high" ? "positive" : entry.confidence === "medium" ? "accent" : "warning")}
        </div>
        <h1>${escapeHtml(entry.game.title)}</h1>
        <p class="product-primary-reason">${escapeHtml(getPrimaryReason(entry))}</p>
        ${renderActionButtons(entry.game.gameId, options.primaryAction, options.secondaryActions)}
        <div class="product-decision-meta">
          ${renderStatusBadge(formatPlatformAvailability(entry), entry.platformAvailability === "unavailable" ? "negative" : entry.platformAvailability === "available" ? "positive" : "warning")}
          ${renderStatusBadge(formatOwnershipStatus(entry.ownershipStatus), entry.ownershipStatus === "owned" ? "positive" : entry.ownershipStatus === "wishlist" ? "accent" : entry.ownershipStatus === "not_owned" ? "neutral" : "warning")}
          ${renderStatusBadge(formatReleaseState(entry.game.releaseState), entry.game.releaseState === "unreleased" ? "warning" : "positive")}
        </div>
        ${options.extraContent ?? ""}
      </div>
      <div class="product-decision-art">
        ${renderCoverArt(entry.game, "hero")}
      </div>
    </section>
  `;
}

function renderGameResultRow(game: SeedGame, ranked: RankedSeedGame, isSelected: boolean) {
  const gameState = ranked.game.gameId;
  return `
    <button type="button" class="product-result-card${isSelected ? " is-selected" : ""}" data-action="select-finder-result" data-game-id="${escapeHtml(gameState)}">
      ${renderCoverArt(game, "thumb")}
      <span class="product-result-main">
        <span class="product-result-title">${escapeHtml(game.title)}</span>
        <span class="product-meta">${escapeHtml(game.series || game.primaryGenre)}</span>
        <span class="product-result-badges">
          ${renderStatusBadge(getDecisionLabel(ranked), getDecisionTone(ranked))}
          ${renderStatusBadge(riskLabel(ranked.riskScore), ranked.riskScore >= 58 ? "negative" : ranked.riskScore >= 35 ? "warning" : "positive")}
        </span>
      </span>
      <span class="product-result-side">
        <span>${escapeHtml(formatOwnershipStatus(ranked.ownershipStatus))}</span>
        <span>${escapeHtml(ranked.platformAvailability === "available" ? "Playable" : ranked.platformAvailability === "unavailable" ? "Unavailable" : "Check platform")}</span>
      </span>
    </button>
  `;
}

function renderLearningSignal(
  gameId: string,
  anchorReasons: Record<string, ProductAnchorReason[]>,
  sentiment?: ProductGameSentiment,
  status?: ProductGameStatus,
) {
  const reasons = anchorReasons[gameId] ?? [];
  const label =
    reasons.includes("repetition") || reasons.includes("grind")
      ? "Taught the model: repetition risk"
      : reasons.includes("confusion")
        ? "Taught the model: confusing systems"
        : reasons.includes("story") || reasons.includes("emotion")
          ? "Taught the model: story pull"
          : reasons.includes("combat")
            ? "Taught the model: combat feel"
            : status === "dropped" || sentiment === "disliked"
              ? "Taught the model: fit breaker"
              : sentiment === "mixed"
                ? "Taught the model: mixed signal"
                : sentiment === "liked"
                  ? "Taught the model: strong fit"
                  : "";

  return label ? `<span class="product-learning-signal">${escapeHtml(label)}</span>` : "";
}

function renderRankedGameCard(
  title: string,
  entry: RankedSeedGame | null,
  options: RankedGameCardOptions = {},
) {
  if (!entry) {
    return options.emphasis === "hero" ? renderDecisionHero(title, null, options) : "";
  }

  return options.emphasis === "hero"
    ? renderDecisionHero(title, entry, options)
    : renderGameDossier(title, entry, { ...options, compact: true });
}

function renderAnchorSelector(
  label: string,
  kind: AnchorKind,
  query: string,
  selectedGameIds: string[],
  gamesById: Map<string, SeedGame>,
  results: SeedGame[],
  currentGameId: string | null,
  anchorReasons: Record<string, ProductAnchorReason[]>,
  anchorOwnership: Record<string, ProductOwnershipStatus>,
) {
  const currentIds = kind === "current" ? (currentGameId ? [currentGameId] : []) : selectedGameIds;
  const selectedMarkup = currentIds.length
    ? currentIds
        .map((gameId) => {
          const game = gamesById.get(gameId);
          if (!game) {
            return "";
          }
          const selectedReasons = new Set(anchorReasons[gameId] ?? []);
          const currentOwnership = anchorOwnership[gameId] ?? "unknown";

          return `
            <article class="product-anchor-selection">
              <div class="product-anchor-selection-head">
                <div>
                  <strong>${escapeHtml(game.title)}</strong>
                  <p class="product-meta">${escapeHtml(game.series || game.primaryGenre || "Catalog")}</p>
                </div>
                <button type="button" class="product-button product-button-ghost product-button-sm" data-action="remove-anchor" data-kind="${kind}" data-game-id="${escapeHtml(gameId)}">Remove</button>
              </div>
              <div class="product-anchor-detail-block">
                <span class="product-field-hint">${kind === "liked" ? "Why it worked" : kind === "disliked" ? "Why it failed" : "Why this is active"}</span>
                <div class="product-chip-list">
                  ${ONBOARDING_ANCHOR_REASON_CHIPS.map((chip) => `
                    <button
                      type="button"
                      class="product-pill-button${selectedReasons.has(chip.id) ? " is-selected" : ""}"
                      data-action="toggle-anchor-reason"
                      data-game-id="${escapeHtml(gameId)}"
                      data-reason-id="${escapeHtml(chip.id)}"
                      aria-pressed="${selectedReasons.has(chip.id) ? "true" : "false"}"
                    >
                      ${escapeHtml(chip.label)}
                    </button>
                  `).join("")}
                </div>
              </div>
              <div class="product-anchor-detail-block">
                <span class="product-field-hint">Access</span>
                <div class="product-chip-list">
                  ${ANCHOR_OWNERSHIP_OPTIONS.map((option) => `
                    <button
                      type="button"
                      class="product-pill-button${currentOwnership === option.value ? " is-selected" : ""}"
                      data-action="set-anchor-ownership"
                      data-game-id="${escapeHtml(gameId)}"
                      data-ownership="${escapeHtml(option.value)}"
                      aria-pressed="${currentOwnership === option.value ? "true" : "false"}"
                    >
                      ${escapeHtml(option.label)}
                    </button>
                  `).join("")}
                </div>
              </div>
            </article>
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
              ? "Games you enjoyed, finished, or would recommend."
              : kind === "disliked"
                ? "Games you dropped, bounced off, or just didn't enjoy."
                : "If you're in the middle of something right now, add it here."
          }</p>
        </div>
        <label class="product-field">
          <span class="product-field-hint">Search title or series</span>
          <input class="product-input" type="search" data-field="anchor-search" data-kind="${kind}" value="${escapeHtml(query)}" placeholder="Type a game title">
        </label>
        <div class="product-anchor-selected-list">${selectedMarkup}</div>
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

const NAV_ICONS: Record<ProductTab, string> = {
  today: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="14" height="13" rx="2"/><path d="M6 1v4M12 1v4M2 8h14"/></svg>`,
  library: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 4h12M3 9h12M3 14h7"/></svg>`,
  finder: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="5"/><path d="M14 14l-2.5-2.5"/></svg>`,
  onboarding: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="9" cy="9" r="3"/><path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.2 3.2l1.4 1.4M13.4 13.4l1.4 1.4M3.2 14.8l1.4-1.4M13.4 4.6l1.4-1.4"/></svg>`,
  profile: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5.5" r="3"/><path d="M3.5 16c.8-3 2.6-4.5 5.5-4.5s4.7 1.5 5.5 4.5"/></svg>`,
  upcoming: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15V4a1 1 0 0 1 1-1h9.5L15 4.5V15"/><path d="M6 7h6M6 10h5M6 13h3"/></svg>`,
};

const ANCHOR_OWNERSHIP_OPTIONS: Array<{ value: ProductOwnershipStatus; label: string }> = [
  { value: "owned", label: "Owned" },
  { value: "wishlist", label: "Wishlist" },
  { value: "not_owned", label: "Not owned" },
  { value: "unknown", label: "Unknown" },
];

const PROFILE_PRIORITY_FIELDS: Array<{
  key: keyof ProductProfile["priorities"];
  label: string;
}> = [
  { key: "story", label: "Story" },
  { key: "progression", label: "Progression" },
  { key: "hook", label: "Early hook" },
  { key: "aesthetic", label: "Aesthetic" },
  { key: "emotional", label: "Emotional" },
  { key: "combat", label: "Combat" },
  { key: "pace", label: "Pace" },
];

const PROFILE_RISK_FIELDS: Array<{
  key: keyof ProductProfile["avoidPatterns"];
  label: string;
}> = [
  { key: "slowStart", label: "Slow starts" },
  { key: "repetition", label: "Repetition or grind" },
  { key: "confusingSystems", label: "Confusing systems" },
  { key: "weakEmotionalPull", label: "Weak emotional pull" },
  { key: "shallowCombat", label: "Shallow combat" },
];

function renderProfileEditor(profile: ProductProfile) {
  const priorityOptions: Array<ProductProfile["priorities"][keyof ProductProfile["priorities"]]> = [
    "low",
    "medium",
    "high",
  ];

  return `
    <div class="product-profile-editor">
      <section class="product-card">
        <h3>Priorities</h3>
        <div class="product-profile-control-list">
          ${PROFILE_PRIORITY_FIELDS.map((field) => `
            <div class="product-profile-control-row">
              <span>${escapeHtml(field.label)}</span>
              <div class="product-segmented-control">
                ${priorityOptions.map((value) => `
                  <button
                    type="button"
                    class="product-pill-button${profile.priorities[field.key] === value ? " is-selected" : ""}"
                    data-action="set-profile-priority"
                    data-profile-key="${escapeHtml(field.key)}"
                    data-profile-value="${escapeHtml(value)}"
                    aria-pressed="${profile.priorities[field.key] === value ? "true" : "false"}"
                  >
                    ${escapeHtml(value)}
                  </button>
                `).join("")}
              </div>
            </div>
          `).join("")}
        </div>
      </section>
      <section class="product-card">
        <h3>Risk patterns</h3>
        <div class="product-chip-list">
          ${PROFILE_RISK_FIELDS.map((field) => `
            <button
              type="button"
              class="product-pill-button${profile.avoidPatterns[field.key] ? " is-selected" : ""}"
              data-action="toggle-profile-risk"
              data-risk-key="${escapeHtml(field.key)}"
              aria-pressed="${profile.avoidPatterns[field.key] ? "true" : "false"}"
            >
              ${escapeHtml(field.label)}
            </button>
          `).join("")}
        </div>
      </section>
    </div>
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
  let statusTimer: ReturnType<typeof setTimeout> | null = null;
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
    historyQuery: "",
    historySelectedGameId: null,
    libraryEditGameId: null,
    dossierGameId: null,
    dossierReturnTab: null,
    statusMessage: null,
    startBannerDismissed: false,
  };

  async function persistState() {
    state.user.lastUpdatedAt = nowIso();
    await saveProductState(state);
  }

  function setStatusMessage(message: string | null) {
    ui.statusMessage = message;
    if (statusTimer) clearTimeout(statusTimer);
    if (message) {
      statusTimer = setTimeout(() => {
        ui.statusMessage = null;
        render();
      }, 4000);
    }
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

  function getAnchorOwnership(gameId: string) {
    return state.user.onboarding.anchorOwnership[gameId] ?? "owned";
  }

  function formatAnchorNotes(gameId: string) {
    const labels = new Map(ONBOARDING_ANCHOR_REASON_CHIPS.map((chip) => [chip.id, chip.label]));
    const reasons = state.user.onboarding.anchorReasons[gameId] ?? [];

    return reasons.length > 0
      ? `Onboarding reasons: ${reasons.map((reason) => labels.get(reason) ?? reason).join(", ")}.`
      : undefined;
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
          <button class="product-button product-button-secondary" data-action="complete-game" data-game-id="${escapeHtml(gameId)}" data-sentiment="mixed">Mixed feelings</button>
          <button class="product-button product-button-ghost" data-action="complete-game" data-game-id="${escapeHtml(gameId)}" data-sentiment="disliked">Didn't click</button>
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
          <strong>Giving up on this one?</strong>
          <p class="product-note">We'll remember it didn't stick and factor it into future suggestions.</p>
        </div>
        <div class="product-actions">
          <button class="product-button product-button-primary" data-action="confirm-drop-run" data-game-id="${escapeHtml(gameId)}">Yes, I'm done with it</button>
          <button class="product-button product-button-ghost" data-action="close-drop-picker" data-game-id="${escapeHtml(gameId)}">Keep playing</button>
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
    const stepIndex = steps.findIndex(([step]) => step === draft.step);
    const stepPills = `
      <div class="product-step-progress">
        ${steps.map(([step, label], i) => `
          <span class="product-step-progress-item${draft.step === step ? " is-active" : i < stepIndex ? " is-done" : ""}">
            <span class="product-step-progress-num">${i < stepIndex ? "✓" : i + 1}</span>
            <span class="product-step-progress-label">${escapeHtml(label)}</span>
          </span>
          ${i < steps.length - 1 ? '<span class="product-step-progress-sep">›</span>' : ""}
        `).join("")}
      </div>
    `;
    const platformRows = seedData.platforms
      .map((platform) => {
        const checked = draft.platforms.some(
          (entry) => entry.platformId === platform.platformId,
        );
        return `
          <label class="product-platform-checkbox${checked ? " is-checked" : ""}">
            <input
              type="checkbox"
              class="product-platform-check"
              data-field="platform-toggle"
              data-platform-id="${escapeHtml(platform.platformId)}"
              ${checked ? "checked" : ""}
            >
            <span class="product-platform-label">
              <strong>${escapeHtml(platform.displayName)}</strong>
              <span class="product-field-hint">${escapeHtml(platform.family.charAt(0).toUpperCase() + platform.family.slice(1))}</span>
            </span>
          </label>
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
            <p class="product-eyebrow">Choose by fit, not hype · Step 1 of 4</p>
            <h1>What are you gaming on?</h1>
            <p class="product-tagline">Select the platforms you have access to right now. We'll only suggest games you can actually play.</p>
          </div>
          <div class="product-platform-grid">${platformRows}</div>
        </div>
      `;
    }

    if (draft.step === "anchors") {
      const likedCount = draft.likedGameIds.length;
      const dislikedCount = draft.dislikedGameIds.length;
      const likedDone = likedCount >= 3;
      const dislikedDone = dislikedCount >= 3;
      stepMarkup = `
        <div class="product-grid">
          <div class="product-step-head">
            <p class="product-eyebrow">Step 2 of 4</p>
            <h1>Tell us about games you've already played</h1>
            <p class="product-tagline">A few games you loved and a few that didn't click is all we need to get started.</p>
            <div class="product-anchor-progress">
              <span class="product-chip ${likedDone ? "product-chip-positive" : ""}">${likedCount}/3 loved</span>
              <span class="product-chip ${dislikedDone ? "product-chip-positive" : ""}">${dislikedCount}/3 didn't click</span>
            </div>
          </div>
          <div class="product-anchor-grid">
            ${renderAnchorSelector("Games you loved or finished", "liked", ui.onboardingSearch.liked, draft.likedGameIds, seedData.gamesById, likedResults, draft.currentGameId, draft.anchorReasons, draft.anchorOwnership)}
            ${renderAnchorSelector("Games that didn't click", "disliked", ui.onboardingSearch.disliked, draft.dislikedGameIds, seedData.gamesById, dislikedResults, draft.currentGameId, draft.anchorReasons, draft.anchorOwnership)}
            ${renderAnchorSelector("Playing right now (optional)", "current", ui.onboardingSearch.current, [], seedData.gamesById, currentResults, draft.currentGameId, draft.anchorReasons, draft.anchorOwnership)}
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
            <p class="product-eyebrow">Step 3 of 4</p>
            <h1>What makes a game work for you?</h1>
            <p class="product-tagline">Pick what resonates. The more honest you are, the better the suggestions get.</p>
          </div>
          <div class="product-card-grid">
            <section class="product-card">
              <h3>What you care about</h3>
              <div class="product-chip-list">${priorityChips}</div>
            </section>
            <section class="product-card">
              <h3>What kills the vibe</h3>
              <div class="product-chip-list">${frictionChips}</div>
            </section>
            <section class="product-card">
              <h3>Your play style</h3>
              <div class="product-chip-list">${playPatternChips}</div>
            </section>
            <label class="product-field">
              <span>In your own words: what makes a game click? <span class="product-field-hint">(optional)</span></span>
              <textarea class="product-textarea" data-field="interview-love" placeholder="e.g. a story that pulls me in, clear goals, quick sense of progress">${escapeHtml(draft.answers.love)}</textarea>
            </label>
            <label class="product-field">
              <span>What usually makes you stop playing? <span class="product-field-hint">(optional)</span></span>
              <textarea class="product-textarea" data-field="interview-frustration" placeholder="e.g. repetitive fights, confusing menus, nothing happens in the first hour">${escapeHtml(draft.answers.frustration)}</textarea>
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
                <p class="product-eyebrow">Step 4 of 4 · Almost there</p>
                <h1>Here's your taste profile</h1>
                <p class="product-tagline">${escapeHtml(profile.summary)}</p>
                <p class="product-note">Adjust anything that feels off before the first recommendation.</p>
              </div>
              ${renderProfileEditor(profile)}
              <div class="product-actions">
                <button class="product-button product-button-primary" data-action="confirm-profile">Let's go</button>
                <button class="product-button product-button-secondary" data-action="generate-profile">Rebuild from answers</button>
              </div>
            </div>
          `
        : `
            <div class="product-grid">
              <div class="product-step-head">
                <p class="product-eyebrow">Step 4 of 4 · Last step</p>
                <h1>Build your taste profile</h1>
                <p class="product-tagline">We'll use everything you told us to create your personal game profile. Takes just a second.</p>
              </div>
              <div class="product-actions">
                <button class="product-button product-button-primary" data-action="generate-profile">Build my profile</button>
              </div>
            </div>
          `;
    }

    const alreadyOnboarded = !!state.user.onboardingCompletedAt;

    return `
      <section class="product-step-card">
        ${alreadyOnboarded ? `<p class="product-gate-message" style="border-color: rgba(91,211,208,0.3); background: rgba(91,211,208,0.06); color: var(--text-secondary);">You've already set up your profile. Any changes here only take effect if you reach the last step and regenerate.</p>` : ""}
        ${stepPills}
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
          draft.step !== "confirm" && !canAdvance
            ? `<p class="product-gate-message">${escapeHtml(gateMessage)}</p>`
            : draft.step !== "confirm" && canAdvance
              ? `<p class="product-note product-gate-ok">✓ ${escapeHtml(gateMessage)}</p>`
              : ""
        }
        ${alreadyOnboarded ? `<div class="product-reset-zone"><button class="product-button product-button-ghost" data-action="reset-local-product">Clear all data and start over</button></div>` : ""}
      </section>
    `;
  }

  function renderHistoryLogger() {
    const results = ui.historyQuery.trim().length > 0
      ? searchSeedGames(seedData.allGames, ui.historyQuery, finderIndex).slice(0, 6)
      : [];

    const selected = ui.historySelectedGameId
      ? seedData.gamesById.get(ui.historySelectedGameId) ?? null
      : null;

    const selectedState = selected ? state.user.gameStates[selected.gameId] : null;
    const alreadyLogged = selectedState?.status === "completed" || selectedState?.status === "dropped";

    return `
      <section class="product-card product-history-logger">
        <div class="product-section-head">
          <h2>Log a game you've played</h2>
          <p class="product-note">Every game you rate makes the suggestions smarter.</p>
        </div>
        <label class="product-label">
          <span>Search title or series</span>
          <input
            class="product-input"
            type="search"
            data-field="history-query"
            value="${escapeHtml(ui.historyQuery)}"
            placeholder="Type a game title"
            autocomplete="off"
          >
        </label>
        ${results.length > 0 && !selected ? `
          <ul class="product-history-results">
            ${results.map(game => {
              const gs = state.user.gameStates[game.gameId];
              const badge = gs?.status === "completed"
                ? `<span class="product-chip product-chip-positive">Logged</span>`
                : gs?.status === "dropped"
                  ? `<span class="product-chip product-chip-negative">Dropped</span>`
                  : "";
              return `
                <li>
                  <button class="product-history-result" data-action="select-history-game" data-game-id="${escapeHtml(game.gameId)}">
                    <span class="product-history-title">${escapeHtml(game.title)}</span>
                    <span class="product-meta">${escapeHtml(game.series || game.primaryGenre)}</span>
                    ${badge}
                  </button>
                </li>
              `;
            }).join("")}
          </ul>
        ` : ""}
        ${selected ? `
          <div class="product-history-confirm">
            <div class="product-history-confirm-head">
              <strong>${escapeHtml(selected.title)}</strong>
              ${alreadyLogged ? `<span class="product-note">Already logged — tap below to update.</span>` : ""}
            </div>
            <p class="product-note">How did it go?</p>
            <div class="product-actions">
              <button class="product-button product-button-primary" data-action="log-history-game" data-game-id="${escapeHtml(selected.gameId)}" data-sentiment="liked" data-status="completed">Loved it</button>
              <button class="product-button product-button-secondary" data-action="log-history-game" data-game-id="${escapeHtml(selected.gameId)}" data-sentiment="mixed" data-status="completed">Mixed feelings</button>
              <button class="product-button product-button-ghost" data-action="log-history-game" data-game-id="${escapeHtml(selected.gameId)}" data-sentiment="disliked" data-status="completed">Didn't click</button>
              <button class="product-button product-button-ghost" data-action="log-history-game" data-game-id="${escapeHtml(selected.gameId)}" data-sentiment="disliked" data-status="dropped">Gave up on it</button>
            </div>
            <button class="product-button product-button-ghost" data-action="clear-history-selection">Cancel</button>
          </div>
        ` : ""}
      </section>
    `;
  }

  function renderDossierActionPanel(entry: RankedSeedGame) {
    const gameState = state.user.gameStates[entry.game.gameId];

    return `
      <div class="product-dossier-action-panel">
        <div class="product-chip-list product-chip-list-tight">
          ${
            gameState?.status === "dropped"
              ? renderStatusBadge("Dropped", "negative")
              : ""
          }
          ${
            gameState?.status === "completed"
              ? renderStatusBadge(
                  `Completed - ${formatCompletionOutcome(gameState.sentiment)}`,
                  gameState.sentiment === "liked"
                    ? "positive"
                    : gameState.sentiment === "disliked"
                      ? "negative"
                      : "warning",
                )
              : ""
          }
        </div>
        <div class="product-state-actions">
          ${
            entry.game.releaseState === "released" &&
            entry.ownershipStatus === "owned" &&
            gameState?.status === "playing"
              ? `<button class="product-button product-button-primary" data-action="open-completion-picker" data-game-id="${escapeHtml(entry.game.gameId)}">Mark completed</button>`
              : entry.game.releaseState === "released" &&
                  entry.ownershipStatus === "owned" &&
                  gameState?.status === "completed"
                ? `<button class="product-button product-button-primary" data-action="open-completion-picker" data-game-id="${escapeHtml(entry.game.gameId)}">Update completion</button>`
                : entry.game.releaseState === "released" &&
                    entry.ownershipStatus === "owned" &&
                    gameState?.status === "dropped"
                  ? `<button class="product-button product-button-primary" data-action="retry-dropped-run" data-game-id="${escapeHtml(entry.game.gameId)}">Retry this run</button>`
                  : entry.game.releaseState === "released" && entry.ownershipStatus === "owned"
                    ? `<button class="product-button product-button-primary" data-action="set-current-run" data-game-id="${escapeHtml(entry.game.gameId)}">Start run</button>`
                    : ""
          }
          ${
            entry.game.releaseState === "unreleased"
              ? `<button class="product-button product-button-secondary" data-action="track-release" data-game-id="${escapeHtml(entry.game.gameId)}">Track release</button>`
              : entry.ownershipStatus !== "owned"
                ? `<button class="product-button product-button-primary" data-action="mark-owned" data-game-id="${escapeHtml(entry.game.gameId)}">I own this</button>`
                : ""
          }
          ${
            entry.game.releaseState === "released" &&
            entry.ownershipStatus === "owned" &&
            gameState?.status !== "completed" &&
            gameState?.status !== "dropped"
              ? `<button class="product-button product-button-secondary" data-action="mark-interested" data-game-id="${escapeHtml(entry.game.gameId)}">Save for later</button>`
              : entry.game.releaseState === "released" && entry.ownershipStatus !== "owned"
                ? `<button class="product-button product-button-secondary" data-action="mark-wishlist" data-game-id="${escapeHtml(entry.game.gameId)}">Add to wishlist</button>`
                : ""
          }
          ${
            entry.game.releaseState === "released" &&
            entry.ownershipStatus === "owned" &&
            (gameState?.status === "playing" || gameState?.status === "on_hold")
              ? `<button class="product-button product-button-secondary" data-action="open-drop-picker" data-game-id="${escapeHtml(entry.game.gameId)}">Drop this run</button>`
              : ""
          }
          ${
            entry.game.releaseState === "released" &&
            entry.ownershipStatus !== "not_owned" &&
            gameState?.status !== "playing" &&
            gameState?.status !== "on_hold"
              ? `<button class="product-button product-button-ghost" data-action="mark-not-owned" data-game-id="${escapeHtml(entry.game.gameId)}">I don't own this</button>`
              : ""
          }
          ${
            gameState?.status !== "completed"
              ? `<button class="product-button product-button-ghost" data-action="dismiss-game" data-game-id="${escapeHtml(entry.game.gameId)}">Not for me</button>`
              : ""
          }
        </div>
        ${renderCompletionPicker(entry.game.gameId, gameState?.sentiment)}
        ${renderDropPicker(entry.game.gameId)}
        <p class="product-note">Local dossier: fit, risk, and confidence come from your profile, library history, and catalog metadata.</p>
      </div>
    `;
  }

  function renderDossierScreen(gameId: string) {
    const profile = state.user.profile;
    const game = getSeedGame(gameId);
    const returnTab = ui.dossierReturnTab ?? ui.activeTab;
    const returnLabel = returnTab === "today"
      ? "Today"
      : returnTab === "finder"
        ? "Finder"
        : returnTab === "library"
          ? "Library"
          : returnTab === "upcoming"
            ? "Upcoming"
            : "Profile";

    if (!profile || !game) {
      return createEmptyState("This dossier is not available yet.", `Back to ${returnLabel}`, "close-dossier");
    }

    const ranked = scoreSeedGame(game, state, profile, seedData.gamesById);

    return `
      <section class="product-grid product-dossier-screen">
        <button class="product-button product-button-ghost product-back-button" data-action="close-dossier">← Back to ${escapeHtml(returnLabel)}</button>
        ${renderGameDossier("Decision dossier", ranked, {
          summary: summarizeRankedGame(ranked),
          detailMeta: `Platforms: ${ranked.game.availablePlatformNames.join(", ") || "Unknown"}`,
          extraContent: renderDossierActionPanel(ranked),
        })}
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
    const heroIsWishlistFallback = !model.currentRun && !model.nextUp && !!model.wishlistFit;
    const hero = model.currentRun ?? model.nextUp ?? model.wishlistFit;
    const heading = model.currentRun ? "Playing now" : model.nextUp ? "Up next" : "Top pick for you";

    const postOnboardingHint = heroIsWishlistFallback && !ui.startBannerDismissed ? `
      <section class="product-card product-start-banner">
        <button class="product-start-banner-close" data-action="dismiss-start-banner" aria-label="Dismiss">✕</button>
        <p class="product-note"><strong>Getting started:</strong> These are unowned picks that fit your taste. Go to <strong>Finder</strong>, mark any game as owned, and it'll appear here as a playable pick.</p>
      </section>
    ` : "";

    return `
      <section class="product-grid">
        ${postOnboardingHint}
        ${renderRankedGameCard(heading, hero, {
          emphasis: "hero",
          primaryAction: model.currentRun
            ? { label: "Put on hold", action: "pause-run" }
            : heroIsWishlistFallback && hero
              ? {
                  label: hero.ownershipStatus === "owned" ? "Start playing" : "I own this",
                  action: hero.ownershipStatus === "owned" ? "set-current-run" : "mark-owned",
                }
              : hero
                ? { label: "Start playing", action: "set-current-run" }
                : undefined,
          secondaryActions:
            model.currentRun
              ? [
                  { label: "Open dossier", action: "open-dossier" },
                  { label: "I finished it", action: "open-completion-picker" },
                  { label: "I gave up on it", action: "open-drop-picker" },
                ]
              : heroIsWishlistFallback && hero
                ? hero.ownershipStatus === "wishlist"
                  ? [{ label: "Open dossier", action: "open-dossier" }]
                  : hero.ownershipStatus === "unknown"
                    ? [{ label: "Open dossier", action: "open-dossier" }]
                    : [{ label: "Open dossier", action: "open-dossier" }]
                : hero
                  ? [{ label: "Open dossier", action: "open-dossier" }]
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
          ${model.currentRun ? renderRankedGameCard("Up next", model.nextUp, {
            primaryAction: model.nextUp ? { label: "Bookmark it", action: "mark-interested" } : undefined,
            secondaryActions: model.nextUp ? [{ label: "Start playing", action: "set-current-run" }] : [],
          }) : ""}
          ${!heroIsWishlistFallback && model.wishlistFit ? renderRankedGameCard("Worth getting", model.wishlistFit, {
            primaryAction: {
              label: model.wishlistFit.ownershipStatus === "owned" ? "Start playing" : "I own this",
              action: model.wishlistFit.ownershipStatus === "owned" ? "set-current-run" : "mark-owned",
            },
            secondaryActions:
              model.wishlistFit.ownershipStatus === "wishlist"
                ? [{ label: "Skip this one", action: "dismiss-game" }]
                : model.wishlistFit.ownershipStatus === "unknown"
                  ? [{ label: "Add to wishlist", action: "mark-wishlist" }]
                  : [],
          }) : ""}
          ${model.playableAlternative ? renderRankedGameCard("Another good option", model.playableAlternative, {
            primaryAction: { label: "Start playing", action: "set-current-run" },
            secondaryActions: [{ label: "Bookmark it", action: "mark-interested" }],
          }) : ""}
          ${model.avoid ? renderRankedGameCard("Might not be for you", model.avoid, {
            primaryAction: { label: "Skip this one", action: "dismiss-game" },
          }) : ""}
          ${model.resume ? renderRankedGameCard("Pick back up", model.resume, {
            primaryAction: { label: "Resume playing", action: "set-current-run" },
            secondaryActions: [{ label: "I gave up on it", action: "open-drop-picker" }],
            extraContent: renderDropPicker(model.resume.game.gameId),
          }) : ""}
        </div>
      </section>
    `;
  }

  function renderLibrary() {
    const allGameStates = Object.entries(state.user.gameStates);

    const sections: Array<{
      heading: string;
      filter: (gs: { status?: string; ownershipStatus?: string; sentiment?: string }) => boolean;
      sentimentBadge: boolean;
    }> = [
      { heading: "Playing now", filter: (gs) => gs.status === "playing", sentimentBadge: false },
      { heading: "On hold", filter: (gs) => gs.status === "on_hold", sentimentBadge: false },
      { heading: "Completed", filter: (gs) => gs.status === "completed", sentimentBadge: true },
      { heading: "Abandoned", filter: (gs) => gs.status === "dropped", sentimentBadge: false },
      { heading: "Interested", filter: (gs) => gs.status === "interested", sentimentBadge: false },
      { heading: "Wishlist", filter: (gs) => gs.ownershipStatus === "wishlist" && gs.status !== "playing" && gs.status !== "on_hold" && gs.status !== "completed" && gs.status !== "dropped", sentimentBadge: false },
    ];

    const sentimentLabel: Record<string, string> = {
      liked: "Loved",
      mixed: "Mixed",
      disliked: "Not for me",
    };
    const sentimentChipKind: Record<string, "positive" | "warning" | "negative"> = {
      liked: "positive",
      mixed: "warning",
      disliked: "negative",
    };

    const totalLogged = allGameStates.filter(
      ([, gs]) => gs.status === "completed" || gs.status === "dropped" || gs.status === "playing",
    ).length;

    const statusLabel: Record<string, string> = {
      playing: "Playing",
      on_hold: "On hold",
      completed: "Completed",
      dropped: "Dropped",
      interested: "Saved",
      dismissed: "Not for me",
    };
    const statusTone: Record<string, StatusTone> = {
      playing: "accent",
      on_hold: "warning",
      completed: "positive",
      dropped: "negative",
      interested: "neutral",
      dismissed: "negative",
    };

    const sectionsHtml = sections
      .map(({ heading, filter, sentimentBadge }) => {
        const entries = allGameStates.filter(([, gs]) => filter(gs));
        if (entries.length === 0) return "";

        const rows = entries
          .map(([gameId, gs]) => {
            const game = seedData.gamesById.get(gameId);
            if (!game) return "";
            const badges = [
              gs.status ? renderStatusBadge(statusLabel[gs.status] ?? gs.status, statusTone[gs.status] ?? "neutral") : "",
              sentimentBadge && gs.sentiment
                ? renderStatusBadge(sentimentLabel[gs.sentiment] ?? gs.sentiment, sentimentChipKind[gs.sentiment] ?? "warning")
                : "",
              gs.ownershipStatus && (gs.ownershipStatus === "owned" || gs.ownershipStatus === "wishlist")
                ? renderStatusBadge(
                    formatOwnershipStatus(gs.ownershipStatus),
                    gs.ownershipStatus === "owned" ? "positive" : "accent",
                  )
                : "",
            ].join("");
            return `
              <li class="product-library-row">
                ${renderCoverArt(game, "thumb")}
                <div class="product-library-info">
                  <span class="product-library-title">${escapeHtml(game.title)}</span>
                  <span class="product-meta">${escapeHtml(game.series || game.primaryGenre)}</span>
                  ${renderLearningSignal(gameId, state.user.onboarding.anchorReasons, gs.sentiment, gs.status)}
                </div>
                <div class="product-library-actions">
                  <div class="product-library-badges">${badges}</div>
                  <button class="product-button product-button-ghost product-button-sm" data-action="library-reopen" data-game-id="${escapeHtml(gameId)}">Edit</button>
                </div>
              </li>
            `;
          })
          .join("");

        return `
          <section class="product-library-section">
            <h3 class="product-library-heading">${escapeHtml(heading)} <span class="product-meta">(${entries.length})</span></h3>
            <ul class="product-library-list">${rows}</ul>
          </section>
        `;
      })
      .join("");

    const editGameId = ui.libraryEditGameId;
    const editGame = editGameId ? seedData.gamesById.get(editGameId) : null;
    const editGs = editGameId ? state.user.gameStates[editGameId] : null;

    const editPanel = editGame && editGameId ? `
      <section class="product-card product-library-edit">
        <div class="product-section-head">
          <h2>${escapeHtml(editGame.title)}</h2>
          <p class="product-meta">${escapeHtml(editGame.series || editGame.primaryGenre)}</p>
        </div>
        <p class="product-note">Update how this game went:</p>
        <div class="product-actions">
          <button class="product-button product-button-primary" data-action="log-history-game" data-game-id="${escapeHtml(editGameId)}" data-sentiment="liked" data-status="completed">Loved it</button>
          <button class="product-button product-button-secondary" data-action="log-history-game" data-game-id="${escapeHtml(editGameId)}" data-sentiment="mixed" data-status="completed">Mixed</button>
          <button class="product-button product-button-ghost" data-action="log-history-game" data-game-id="${escapeHtml(editGameId)}" data-sentiment="disliked" data-status="completed">Not for me</button>
          <button class="product-button product-button-ghost" data-action="log-history-game" data-game-id="${escapeHtml(editGameId)}" data-sentiment="disliked" data-status="dropped">Abandoned</button>
        </div>
        ${editGs?.status === "playing" ? `
          <div class="product-actions">
            <button class="product-button product-button-secondary" data-action="open-completion-picker" data-game-id="${escapeHtml(editGameId)}">Mark completed</button>
            <button class="product-button product-button-ghost" data-action="open-drop-picker" data-game-id="${escapeHtml(editGameId)}">Drop this run</button>
          </div>
          ${renderCompletionPicker(editGameId, editGs.sentiment)}
          ${renderDropPicker(editGameId)}
        ` : ""}
        <button class="product-button product-button-ghost" data-action="library-close-edit">Cancel</button>
      </section>
    ` : "";

    return `
      <section class="product-grid">
        ${editPanel}
        ${renderHistoryLogger()}
        <section class="product-card product-library">
          <div class="product-section-head">
            <h2>Your games</h2>
            ${totalLogged > 0 ? `<p class="product-note">${totalLogged} game${totalLogged !== 1 ? "s" : ""} logged. Each one makes your suggestions more accurate.</p>` : ""}
          </div>
          ${sectionsHtml || createEmptyState("Nothing here yet. Log a game you've already played and the suggestions get sharper immediately.", "Go to Today", "go-today")}
        </section>
      </section>
    `;
  }

  function renderProfile() {
    const profile = state.user.profile;

    if (!profile) {
      return createEmptyState(
        "Finish setup first so your local taste profile can be edited here.",
        "Open setup",
        "go-setup",
      );
    }

    const positiveSignals = profile.signals.filter((signal) => signal.tone === "positive");
    const negativeSignals = profile.signals.filter((signal) => signal.tone === "negative");
    const loggedCount = Object.values(state.user.gameStates).filter(
      (gs) => gs.status === "completed" || gs.status === "dropped" || gs.status === "playing",
    ).length;
    const confidenceLabel =
      loggedCount >= 8
        ? "High confidence"
        : loggedCount >= 4
          ? "Medium confidence"
          : "Still learning";
    return `
      <section class="product-grid">
        <section class="product-card product-profile-overview">
          <div class="product-section-head">
            <p class="product-eyebrow">Local taste model</p>
            <h2>Your profile</h2>
            <p class="product-tagline">${escapeHtml(profile.summary)}</p>
            <p class="product-note">Built from structured choices and local history. No AI is required.</p>
          </div>
          <div class="product-profile-signal-grid">
            <article class="product-signal-panel">
              <span class="product-eyebrow">What you like</span>
              <div class="product-chip-list">
                ${positiveSignals.length > 0 ? positiveSignals.map((signal) => renderStatusBadge(signal.label, "positive")).join("") : renderStatusBadge("More loved games needed", "neutral")}
              </div>
            </article>
            <article class="product-signal-panel">
              <span class="product-eyebrow">What breaks fit</span>
              <div class="product-chip-list">
                ${negativeSignals.length > 0 ? negativeSignals.map((signal) => renderStatusBadge(signal.label, "negative")).join("") : renderStatusBadge("No major pattern yet", "neutral")}
              </div>
            </article>
            <article class="product-signal-panel">
              <span class="product-eyebrow">Current confidence</span>
              <strong>${escapeHtml(confidenceLabel)}</strong>
              <p class="product-note">${loggedCount} logged game${loggedCount === 1 ? "" : "s"} shaping the local profile.</p>
              ${renderStatusBadge(profile.watchVsPlayRisk === "high" ? "Watch-vs-play risk flagged" : "Playable recommendations prioritized", profile.watchVsPlayRisk === "high" ? "warning" : "positive")}
            </article>
          </div>
        </section>
        ${renderProfileEditor(profile)}
        <section class="product-card product-recalibrate">
          <div class="product-recalibrate-body">
            <div>
              <strong>Refresh from onboarding answers</strong>
              <p class="product-note">This rebuilds the local profile, then you can adjust it again.</p>
            </div>
            <button class="product-button product-button-secondary" data-action="recalibrate-profile">Rebuild local profile</button>
          </div>
        </section>
      </section>
    `;
  }

  function renderUpcoming() {
    if (!state.user.profile) {
      return createEmptyState(
        "Finish setup first so upcoming releases can be scored against your taste profile.",
        "Open setup",
        "go-setup",
      );
    }

    const upcoming = seedData.allGames
      .filter((game) => game.releaseState === "unreleased")
      .map((game) => scoreSeedGame(game, state, state.user.profile!, seedData.gamesById))
      .filter((entry) => state.user.gameStates[entry.game.gameId]?.status !== "dismissed")
      .sort((left, right) => {
        const leftTracked = state.user.gameStates[left.game.gameId]?.ownershipStatus === "wishlist" ? 1 : 0;
        const rightTracked = state.user.gameStates[right.game.gameId]?.ownershipStatus === "wishlist" ? 1 : 0;
        return rightTracked - leftTracked || right.affinityScore - left.affinityScore || left.riskScore - right.riskScore;
      })
      .slice(0, 8);

    return `
      <section class="product-grid">
        <section class="product-card product-radar-head">
          <div class="product-section-head">
            <p class="product-eyebrow">Radar, not play-now</p>
            <h2>Upcoming worth watching</h2>
            <p class="product-tagline">Future releases stay separate from Today so they do not crowd out games you can play right now.</p>
          </div>
        </section>
        <div class="product-radar-grid">
          ${upcoming.map((entry) => {
            const tracked = state.user.gameStates[entry.game.gameId]?.ownershipStatus === "wishlist";
            return `
              <article class="product-radar-card">
                ${renderCoverArt(entry.game, "thumb")}
                <div class="product-radar-body">
                  <div>
                    <p class="product-eyebrow">Worth watching</p>
                    <h3>${escapeHtml(entry.game.title)}</h3>
                    <p class="product-meta">${escapeHtml(entry.game.series || entry.game.primaryGenre)}</p>
                  </div>
                  <div class="product-chip-list product-chip-list-tight">
                    ${tracked ? renderStatusBadge("Tracked", "accent") : renderStatusBadge("Not playable yet", "warning")}
                    ${renderStatusBadge(entry.platformAvailability === "available" ? "Available to you" : "Platform unclear", entry.platformAvailability === "available" ? "positive" : "warning")}
                    ${renderStatusBadge(getDecisionLabel(entry), getDecisionTone(entry))}
                  </div>
                  <p class="product-primary-reason">${escapeHtml(getPrimaryReason(entry))}</p>
                  ${renderActionButtons(entry.game.gameId, { label: tracked ? "Tracking" : "Track release", action: "track-release" }, [{ label: "Not for me", action: "dismiss-game" }])}
                </div>
              </article>
            `;
          }).join("") || createEmptyState("No upcoming releases are available in the current seed data.")}
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

    const finderQuery = ui.finderQuery.trim();
    const exactMatch = finderQuery ? findExactSeedGame(seedData.allGames, finderQuery) : null;
    const hasOnlyNearbyMatches = Boolean(finderQuery && !exactMatch && !ui.finderSelectedGameId);
    const results = finderQuery
      ? searchSeedGames(seedData.allGames, ui.finderQuery, finderIndex)
      : [...seedData.allGames]
          .filter((game) => game.releaseState === "released")
          .map((game) => scoreSeedGame(game, state, state.user.profile!, seedData.gamesById))
          .sort((a, b) => b.affinityScore - a.affinityScore)
          .slice(0, 12)
          .map((r) => r.game);
    const selectedGame =
      (ui.finderSelectedGameId ? getSeedGame(ui.finderSelectedGameId) : null) ??
      exactMatch ??
      (finderQuery ? null : results[0]) ??
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
            <p class="product-eyebrow">${finderQuery ? hasOnlyNearbyMatches ? "Closest matches" : "Search results" : "Top picks for you"}</p>
            <h2>Find your fit</h2>
            <p class="product-tagline">${
              finderQuery
                ? hasOnlyNearbyMatches
                  ? "No exact match found. Select a nearby result only if it is the game you meant."
                  : "Showing results scored against your taste profile."
                : "Showing your top picks by fit score. Search to explore anything else."
            }</p>
          </div>
          <label class="product-field">
            <span class="product-field-hint">Search by title, series, or genre</span>
            <input class="product-input" type="search" data-field="finder-query" value="${escapeHtml(ui.finderQuery)}" placeholder="Search a game…">
          </label>
          <div class="product-results-list">
            ${results
              .map((game) => {
                const ranked = scoreSeedGame(game, state, state.user.profile!, seedData.gamesById);
                const isSelected = selectedGame?.gameId === game.gameId;

                return renderGameResultRow(game, ranked, isSelected);
              })
              .join("")}
          </div>
        </div>
        <div class="product-detail-card product-grid">
          <button class="product-button product-button-ghost product-finder-back" data-action="finder-back-to-list">← Back to results</button>
          ${
            selectedRanked
              ? `
                <div class="product-detail-layout">
                  <div class="product-cover-shell">
                    ${
                      selectedRanked.game.coverPath
                        ? `<img src="${escapeHtml(selectedRanked.game.coverPath)}" alt="${escapeHtml(selectedRanked.game.title)} cover art" loading="lazy" decoding="async">`
                        : `<span class="product-cover-initials">${escapeHtml((() => { const ws = selectedRanked.game.title.split(" ").filter((w) => w && !/^\d/.test(w)); return (ws.length > 0 ? ws : selectedRanked.game.title.split(" ").filter(Boolean)).slice(0,2).map((w) => w[0].toUpperCase()).join(""); })())}</span>`
                    }
                  </div>
                  <div class="product-grid">
                    <div class="product-section-head">
                      <p class="product-eyebrow">${escapeHtml(selectedRanked.game.releaseState === "unreleased" ? "Coming soon" : "In catalog")}</p>
                      <h2>${escapeHtml(selectedRanked.game.title)}</h2>
                      <p class="product-tagline">${escapeHtml(activeInsight?.insight?.summary ?? localInsight?.summary ?? "")}</p>
                    </div>
                    <div class="product-chip-list">
                      ${renderChip(`${affinityLabel(selectedRanked.affinityScore, selectedRanked.confidence)} · ${selectedRanked.affinityScore}`)}
                      ${renderChip(`${riskLabel(selectedRanked.riskScore)} · ${selectedRanked.riskScore}`, selectedRanked.riskScore >= 58 ? "negative" : selectedRanked.riskScore >= 35 ? "warning" : "positive")}
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
                        <strong>Why this could work for you</strong>
                        <ul>
                          ${(activeInsight?.insight?.fitReasons ?? localInsight?.fitReasons ?? [])
                            .map((reason) => `<li>${escapeHtml(reason)}</li>`)
                            .join("")}
                        </ul>
                      </div>
                      <div>
                        <strong>What to watch out for</strong>
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
                          ? `<button class="product-button product-button-ghost" data-action="request-finder-insight" data-game-id="${escapeHtml(selectedRanked.game.gameId)}">${activeInsight?.status === "loading" ? "Thinking…" : "Get a deeper AI read"}</button>`
                          : ""
                      }
                    </div>
                    ${renderCompletionPicker(selectedRanked.game.gameId, selectedGameState?.sentiment)}
                    ${renderDropPicker(selectedRanked.game.gameId)}
                    ${
                      runtimeMode === "local-only"
                        ? `<p class="product-note">Running locally — scores are based on your profile and game data, no AI needed.</p>`
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
              : finderQuery
                ? createEmptyState(
                    hasOnlyNearbyMatches
                      ? "No exact match found. Choose a closest match from the list if one is correct."
                      : "No results found. Try a different title or series name.",
                  )
                : createEmptyState("No results found. Try a different title or series name.")
          }
        </div>
      </section>
    `;
  }

  function render() {
    const focusSnapshot = captureFocusSnapshot(root);
    const isOnboarded = !!state.user.onboardingCompletedAt;
    const availableTabs: ProductTab[] = isOnboarded
      ? ["today", "library", "finder", "upcoming", "profile"]
      : ["onboarding"];
    const tabLabel: Record<ProductTab, string> = {
      onboarding: "Setup",
      today: "Today",
      finder: "Finder",
      library: "Library",
      profile: "Profile",
      upcoming: "Upcoming",
    };

    const statusLabel = runtimeMode === "ai-assisted" ? "AI" : "Local";
    const statusCls = runtimeMode === "ai-assisted" ? " app-status-ai" : "";
    const mainContent = ui.dossierGameId
      ? renderDossierScreen(ui.dossierGameId)
      : ui.activeTab === "onboarding"
        ? `<section class="product-onboarding-shell">${renderOnboarding()}</section>`
        : ui.activeTab === "today"
          ? renderToday()
          : ui.activeTab === "library"
            ? renderLibrary()
            : ui.activeTab === "profile"
              ? renderProfile()
              : ui.activeTab === "upcoming"
                ? renderUpcoming()
                : renderFinder();

    const navItems = availableTabs.map((tab) => `
      <button class="app-nav-item${ui.activeTab === tab ? " is-active" : ""}" data-action="switch-tab" data-tab="${tab}" aria-current="${ui.activeTab === tab ? "page" : "false"}">
        ${NAV_ICONS[tab]}
        <span>${tabLabel[tab]}</span>
      </button>
    `).join("");

    const bottomNavItems = availableTabs.map((tab) => `
      <button class="app-bottom-nav-item${ui.activeTab === tab ? " is-active" : ""}" data-action="switch-tab" data-tab="${tab}" aria-current="${ui.activeTab === tab ? "page" : "false"}">
        ${NAV_ICONS[tab]}
        <span>${tabLabel[tab]}</span>
      </button>
    `).join("");

    root.innerHTML = `
      <div class="app-shell">
        <aside class="app-sidebar">
          <div class="app-brand">
            <span class="app-brand-eyebrow">Playfit</span>
            <strong class="app-brand-name">Game concierge</strong>
          </div>
          <nav class="app-nav" aria-label="Main navigation">
            ${navItems}
          </nav>
          <div class="app-sidebar-footer">
            <span class="app-status-chip${statusCls}">${escapeHtml(statusLabel)}</span>
            ${isOnboarded ? "" : `<p class="app-sidebar-tagline">Stop abandoning games. Find what actually fits you.</p>`}
          </div>
        </aside>

        <div class="app-main">
          <header class="app-topbar">
            <div class="app-brand">
              <span class="app-brand-eyebrow">Playfit</span>
              <strong class="app-brand-name">Game concierge</strong>
            </div>
            <span class="app-status-chip${statusCls}">${escapeHtml(statusLabel)}</span>
          </header>

          <main class="app-content">
            ${mainContent}
          </main>

          <nav class="app-bottom-nav" aria-label="Main navigation">
            ${bottomNavItems}
          </nav>
        </div>
      </div>
      ${ui.statusMessage ? `<div class="product-toast" role="status">${escapeHtml(ui.statusMessage)}</div>` : ""}
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

    if (runtimeMode === "local-only") {
      const profile = buildFallbackProfile(draft, seedData.gamesById);
      state.user.onboarding.draftProfile = profile;
      if (state.user.onboardingCompletedAt && ui.activeTab !== "onboarding") {
        state.user.profile = profile;
      }
      setStatusMessage("Profile generated locally.");
      await persistState();
      render();
      return;
    }

    try {
      const profile = await requestOnboardingProfile({
        likedGames,
        dislikedGames,
        currentGame,
        answers: draft.answers,
      });
      state.user.onboarding.draftProfile = profile;
      if (state.user.onboardingCompletedAt && ui.activeTab !== "onboarding") {
        state.user.profile = profile;
      }
      setStatusMessage("Profile generated through the AI proxy.");
    } catch {
      const profile = buildFallbackProfile(draft, seedData.gamesById);
      state.user.onboarding.draftProfile = profile;
      if (state.user.onboardingCompletedAt && ui.activeTab !== "onboarding") {
        state.user.profile = profile;
      }
      setStatusMessage("AI profile unavailable. Profile generated locally.");
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
        status: "completed",
        sentiment: "liked",
        ownershipStatus: getAnchorOwnership(gameId),
        notes: formatAnchorNotes(gameId),
        source: "onboarding",
      });
    });
    state.user.onboarding.dislikedGameIds.forEach((gameId) => {
      updateGameState(gameId, {
        status: "dropped",
        sentiment: "disliked",
        ownershipStatus: getAnchorOwnership(gameId),
        notes: formatAnchorNotes(gameId),
        source: "onboarding",
      });
    });

    if (state.user.onboarding.currentGameId) {
      const gameId = state.user.onboarding.currentGameId;
      updateGameState(state.user.onboarding.currentGameId, {
        status: "playing",
        ownershipStatus: getAnchorOwnership(gameId),
        notes: formatAnchorNotes(gameId),
        source: "onboarding",
      });
    }

    ui.activeTab = "today";
    setStatusMessage("You're all set. Here are your first picks.");
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

    if (field === "history-query" && target instanceof HTMLInputElement) {
      ui.historyQuery = target.value;
      ui.historySelectedGameId = null;
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
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    if (target.dataset.field === "platform-toggle") {
      const platformId = target.dataset.platformId;
      if (!platformId) return;

      state.user.onboarding.platforms = state.user.onboarding.platforms.filter(
        (entry) => entry.platformId !== platformId,
      );

      if (target.checked) {
        state.user.onboarding.platforms.push({ platformId, status: "available" });
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

    if (action === "toggle-anchor-reason" && gameId) {
      const reason = button.dataset.reasonId as ProductAnchorReason | undefined;
      if (!reason) return;

      const selected = new Set(state.user.onboarding.anchorReasons[gameId] ?? []);
      if (selected.has(reason)) {
        selected.delete(reason);
      } else {
        selected.add(reason);
      }
      state.user.onboarding.anchorReasons[gameId] = [...selected];
      await persistState();
      render();
      return;
    }

    if (action === "set-anchor-ownership" && gameId) {
      const ownership = button.dataset.ownership as ProductOwnershipStatus | undefined;
      if (!ownership) return;

      state.user.onboarding.anchorOwnership[gameId] = ownership;
      await persistState();
      render();
      return;
    }

    if (action === "set-profile-priority") {
      const key = button.dataset.profileKey as keyof ProductProfile["priorities"] | undefined;
      const value = button.dataset.profileValue as ProductProfile["priorities"][keyof ProductProfile["priorities"]] | undefined;
      const profile = ui.activeTab === "onboarding" && state.user.onboarding.step === "confirm"
        ? state.user.onboarding.draftProfile
        : state.user.profile;

      if (!profile || !key || !value) return;
      profile.priorities[key] = value;
      await persistState();
      render();
      return;
    }

    if (action === "toggle-profile-risk") {
      const key = button.dataset.riskKey as keyof ProductProfile["avoidPatterns"] | undefined;
      const profile = ui.activeTab === "onboarding" && state.user.onboarding.step === "confirm"
        ? state.user.onboarding.draftProfile
        : state.user.profile;

      if (!profile || !key) return;
      profile.avoidPatterns[key] = !profile.avoidPatterns[key];
      await persistState();
      render();
      return;
    }

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
        ui.dossierGameId = null;
        ui.dossierReturnTab = null;
        closeCompletionPicker();
        closeDropPicker();
        setStatusMessage(null);
        render();
        window.scrollTo({ top: 0, behavior: "instant" });
      }
      return;
    }

    if (action === "open-dossier" && gameId) {
      ui.dossierGameId = gameId;
      ui.dossierReturnTab = ui.activeTab;
      closeCompletionPicker();
      closeDropPicker();
      setStatusMessage(null);
      render();
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }

    if (action === "close-dossier") {
      ui.dossierGameId = null;
      closeCompletionPicker();
      closeDropPicker();
      setStatusMessage(null);
      render();
      window.scrollTo({ top: 0, behavior: "instant" });
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
        state.user.onboarding.dislikedGameIds = state.user.onboarding.dislikedGameIds.filter(
          (entry) => entry !== gameId,
        );
        state.user.onboarding.likedGameIds = [
          ...new Set([...state.user.onboarding.likedGameIds, gameId]),
        ].slice(0, 3);
      } else if (kind === "disliked") {
        state.user.onboarding.likedGameIds = state.user.onboarding.likedGameIds.filter(
          (entry) => entry !== gameId,
        );
        state.user.onboarding.dislikedGameIds = [
          ...new Set([...state.user.onboarding.dislikedGameIds, gameId]),
        ].slice(0, 3);
      } else {
        state.user.onboarding.currentGameId = gameId;
      }

      state.user.onboarding.anchorOwnership[gameId] ??= "owned";

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

      const stillSelected =
        state.user.onboarding.currentGameId === gameId ||
        state.user.onboarding.likedGameIds.includes(gameId) ||
        state.user.onboarding.dislikedGameIds.includes(gameId);

      if (!stillSelected) {
        delete state.user.onboarding.anchorReasons[gameId];
        delete state.user.onboarding.anchorOwnership[gameId];
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
      ui.dossierGameId = null;
      ui.dossierReturnTab = null;
      render();
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }

    if (action === "go-today") {
      ui.activeTab = "today";
      ui.dossierGameId = null;
      ui.dossierReturnTab = null;
      render();
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }

    if (action === "dismiss-start-banner") {
      ui.startBannerDismissed = true;
      render();
      return;
    }

    if (action === "recalibrate-profile") {
      await handleGenerateProfile();
      return;
    }

    if (action === "finder-back-to-list") {
      ui.finderSelectedGameId = null;
      render();
      requestAnimationFrame(() => {
        root.querySelector<HTMLElement>(".product-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }

    if (action === "select-finder-result" && gameId) {
      ui.finderSelectedGameId = gameId;
      closeCompletionPicker();
      closeDropPicker();
      ui.finderInsight = null;
      render();
      // On mobile, scroll the detail panel into view after render
      requestAnimationFrame(() => {
        const detail = root.querySelector<HTMLElement>(".product-detail-card");
        if (detail && window.innerWidth < 1100) {
          detail.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
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
      setStatusMessage("Now playing. Any previous run was moved to on hold.");
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
          ? "Nice one! Logged as loved — that shapes your future picks."
          : sentiment === "disliked"
            ? "Got it. We'll factor that out of future suggestions."
            : "Logged with mixed feelings. Noted for the profile.",
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
      setStatusMessage("Dropped. We'll remember this one didn't stick.");
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
      setStatusMessage("Giving it another shot — set as current run.");
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
      setStatusMessage("Bookmarked. You'll find it in your library.");
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
      setStatusMessage("Added to wishlist. It'll show up in Today as a pick to get.");
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
      setStatusMessage("Marked as owned — it's now eligible to appear in Today.");
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
      setStatusMessage("Got it — it can still show as something worth getting, just not as a play-now pick.");
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
      setStatusMessage("On your radar. We'll keep it in view.");
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
      setStatusMessage("Skipped. It won't come up again.");
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
      setStatusMessage("Paused. You can pick it back up anytime from Today.");
      await persistState();
      render();
      return;
    }

    if (gameId && action === "select-history-game") {
      ui.historySelectedGameId = gameId;
      ui.historyQuery = seedData.gamesById.get(gameId)?.title ?? ui.historyQuery;
      render();
      return;
    }

    if (action === "clear-history-selection") {
      ui.historySelectedGameId = null;
      ui.historyQuery = "";
      render();
      return;
    }

    if (gameId && action === "log-history-game") {
      const sentiment = button.dataset.sentiment as ProductGameSentiment | undefined;
      const status = button.dataset.status as "completed" | "dropped" | undefined;
      if (!sentiment || !status) return;
      updateGameState(gameId, {
        status,
        sentiment,
        ownershipStatus: "owned",
        source: "manual",
      });
      ui.historySelectedGameId = null;
      ui.historyQuery = "";
      ui.libraryEditGameId = null;
      const game = seedData.gamesById.get(gameId);
      const label = status === "dropped" ? "given up on" : sentiment === "liked" ? "loved" : sentiment === "disliked" ? "not your thing" : "mixed";
      setStatusMessage(`${game?.title ?? "Game"} logged as ${label}. Your suggestions just got a bit sharper.`);
      await persistState();
      render();
      return;
    }

    if (gameId && action === "library-reopen") {
      ui.libraryEditGameId = gameId;
      render();
      return;
    }

    if (action === "library-close-edit") {
      ui.libraryEditGameId = null;
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
      setStatusMessage("All data cleared. Starting fresh.");
      render();
    }
  });

  render();
}
