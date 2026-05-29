import { requestOnboardingProfile } from "./ai/client";
import {
  applyProfileOverrides,
  buildAdaptiveProfile,
  canAdvanceOnboarding,
  hasRequiredAnchorDetails,
  nextOnboardingStep,
  normalizeProfileSignals,
  ONBOARDING_ANCHOR_REASON_CHIPS,
  ONBOARDING_FRICTION_CHIPS,
  ONBOARDING_PLAY_PATTERN_CHIPS,
  ONBOARDING_PRIORITY_CHIPS,
} from "./domain/onboarding";
import {
  buildFinderIndex,
  buildTodayModel,
  findExactSeedGame,
  HIGH_FRICTION_THRESHOLD,
  PROMISING_FIT_THRESHOLD,
  scoreSeedGame,
  searchSeedGames,
  STRONG_FIT_THRESHOLD,
} from "./domain/recommendations";
import { createInitialState, saveProductState, resetProductState } from "./store/indexed-db";
import type {
  FinderActionType,
  ProductAnchorReason,
  ProductCollectionStatus,
  ProductConfidence,
  ProductGameSentiment,
  ProductGameStatus,
  ProductOwnershipStatus,
  ProductProfile,
  ProductSeedData,
  ProductRuntimeMode,
  ProductState,
  ProductTodayModel,
  ProductProfileOverrides,
  RankedSeedGame,
  SeedGame,
} from "./types";

type ProductTab = "onboarding" | "today" | "finder" | "library" | "profile" | "upcoming";
type AnchorKind = "liked" | "disliked" | "current";
type ProductModal = "history-log" | "library-edit" | "completion" | "drop" | "recalibrate" | "friction-confirm";
type ProductProfileMode = "overview" | "edit";
type FrictionGuardedAction = "set-current-run" | "add-backlog" | "mark-wishlist";

interface ProductOutcomeNotice {
  gameId: string;
  title: string;
  status: "beaten" | "completed" | "abandoned";
  sentiment: ProductGameSentiment;
}

interface ProductUiState {
  activeTab: ProductTab;
  onboardingSearch: Record<AnchorKind, string>;
  finderQuery: string;
  finderSelectedGameId: string | null;
  historyQuery: string;
  historySelectedGameId: string | null;
  activeModal: ProductModal | null;
  modalGameId: string | null;
  profileMode: ProductProfileMode;
  dossierGameId: string | null;
  dossierReturnTab: ProductTab | null;
  statusMessage: string | null;
  outcomeNotice: ProductOutcomeNotice | null;
  pendingFrictionAction: { gameId: string; action: FrictionGuardedAction } | null;
  startBannerDismissed: boolean;
  upcomingPlatformFilters: Set<string>;
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
      return "Strong signal";
    case "medium":
      return "Good signal";
    case "low":
    default:
      return "Early signal";
  }
}

const MODERATE_FRICTION_THRESHOLD = 35;
const WEAK_FIT_THRESHOLD = 45;

function formatAccessStatus(entry: RankedSeedGame) {
  switch (entry.accessStatus) {
    case "playable":
      return "Playable for you";
    case "not_on_platforms":
      return "Not on your platforms";
    case "unreleased":
      return "Not playable yet";
    case "unknown_platform":
    default:
      return "Check platform";
  }
}

function accessTone(entry: RankedSeedGame): StatusTone {
  if (entry.accessStatus === "playable") return "positive";
  if (entry.accessStatus === "not_on_platforms") return "negative";
  return "warning";
}

function formatReleaseState(value: RankedSeedGame["game"]["releaseState"]) {
  return value === "unreleased" ? "Unreleased" : "Released";
}

function isBasicCatalogGame(game: SeedGame) {
  return game.scoringStatus === "basic";
}

function isPlayStatus(value: ProductGameStatus | undefined) {
  return Boolean(
    value &&
      ["playing", "on_hold", "shelved", "beaten", "completed", "dropped", "abandoned", "dismissed"].includes(value),
  );
}

function getCollectionStatus(gameState?: { status?: ProductGameStatus; collectionStatus?: ProductCollectionStatus; ownershipStatus?: ProductOwnershipStatus }) {
  if (gameState?.collectionStatus) {
    return gameState.collectionStatus;
  }

  if (gameState?.status === "backlog" || gameState?.status === "interested") {
    return "backlog";
  }

  if (gameState?.ownershipStatus === "wishlist") {
    return "wishlist";
  }

  return null;
}

function isSavedToMyGames(gameState?: {
  status?: ProductGameStatus;
  collectionStatus?: ProductCollectionStatus;
  ownershipStatus?: ProductOwnershipStatus;
  sentiment?: ProductGameSentiment;
  rating?: number;
}) {
  if (!gameState) {
    return false;
  }

  return Boolean(
    [
      "playing",
      "backlog",
      "interested",
      "shelved",
      "on_hold",
      "beaten",
      "completed",
      "dropped",
      "abandoned",
      "dismissed",
    ].includes(gameState.status ?? "") ||
      getCollectionStatus(gameState) ||
      gameState.sentiment ||
      gameState.rating,
  );
}

function formatCollectionStatus(value: ProductCollectionStatus | null | undefined) {
  switch (value) {
    case "backlog":
      return "Backlog";
    case "wishlist":
      return "Wishlist";
    default:
      return "";
  }
}

function collectionTone(value: ProductCollectionStatus | null | undefined): StatusTone {
  return value === "wishlist" ? "accent" : "neutral";
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
      return "Completed 100%";
  }
}

function formatGameStatus(value: ProductGameStatus | undefined) {
  switch (value) {
    case "playing":
      return "Playing";
    case "backlog":
    case "interested":
      return "Backlog";
    case "on_hold":
    case "shelved":
      return "Shelved";
    case "beaten":
      return "Finished story";
    case "completed":
      return "Completed 100%";
    case "dropped":
    case "abandoned":
      return "Abandoned";
    case "dismissed":
      return "Not for me";
    default:
      return "";
  }
}

function summarizeRankedGame(entry: RankedSeedGame) {
  if (isBasicCatalogGame(entry.game)) {
    return "I can save this to My Games, but I do not know enough about it yet.";
  }

  if (entry.affinityScore >= STRONG_FIT_THRESHOLD && entry.riskScore <= MODERATE_FRICTION_THRESHOLD) {
    return "This looks like a strong next game for you.";
  }

  if (entry.riskScore >= HIGH_FRICTION_THRESHOLD) {
    return "There is a real chance this will frustrate you.";
  }

  if (entry.affinityScore >= PROMISING_FIT_THRESHOLD) {
    return "Worth trying, especially if you can sample the first hour.";
  }

  return "I would wait for more signals before calling this a strong pick.";
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
    if (likedLeft === 0) {
      return hasRequiredAnchorDetails(draft)
        ? "Great — that's enough to get started."
        : "Add at least one reason and list status for each selected game.";
    }
    return `Add ${likedLeft} more game${likedLeft === 1 ? "" : "s"} you loved to continue.`;
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
  if (score >= STRONG_FIT_THRESHOLD) return confidence === "low" ? "Worth a look" : "Looks right for you";
  if (score >= PROMISING_FIT_THRESHOLD) return "Worth a look";
  if (score >= WEAK_FIT_THRESHOLD) return "Still learning";
  return "Weak match";
}

function frictionLabel(score: number): string {
  if (score >= HIGH_FRICTION_THRESHOLD) return "High friction";
  if (score >= MODERATE_FRICTION_THRESHOLD) return "Possible friction";
  return "Low friction";
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
        game.coverPath || game.externalCoverUrl
          ? `<img src="${escapeHtml(game.coverPath || game.externalCoverUrl || "")}" alt="${escapeHtml(game.title)} cover art" loading="lazy" decoding="async">`
          : `<span class="product-cover-initials product-cover-fallback"><strong>${escapeHtml(getCoverInitials(game))}</strong>${fallbackTitle}<em>${escapeHtml(game.primaryGenre.replaceAll("_", " "))}</em></span>`
      }
    </div>
  `;
}

function getDecisionTone(entry: RankedSeedGame): StatusTone {
  if (isBasicCatalogGame(entry.game)) return "neutral";
  if (entry.riskScore >= HIGH_FRICTION_THRESHOLD) return "negative";
  if (entry.affinityScore >= STRONG_FIT_THRESHOLD && entry.riskScore <= MODERATE_FRICTION_THRESHOLD) return "positive";
  if (entry.affinityScore >= PROMISING_FIT_THRESHOLD) return "accent";
  return "warning";
}

function getDecisionLabel(entry: RankedSeedGame) {
  if (isBasicCatalogGame(entry.game)) return "Needs more info";
  if (entry.riskScore >= HIGH_FRICTION_THRESHOLD) return "High friction";
  return affinityLabel(entry.affinityScore, entry.confidence);
}

function getPrimaryReason(entry: RankedSeedGame) {
  if (isBasicCatalogGame(entry.game)) {
    return "Need more info first";
  }

  if (entry.riskScore >= HIGH_FRICTION_THRESHOLD && entry.cautionReasons.length > 0) {
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
  if (isBasicCatalogGame(entry.game)) {
    return `
      <div class="product-metric-strip product-metric-strip-basic" aria-label="Catalog status">
        <div class="product-metric">
          <span>Detail</span>
          <strong>Basic</strong>
        </div>
        <div class="product-metric">
          <span>Source</span>
          <strong>Finder</strong>
        </div>
        <div class="product-metric">
          <span>Signal</span>
          <strong>Not enough yet</strong>
        </div>
      </div>
    `;
  }

  return `
    <div class="product-metric-strip" aria-label="Recommendation metrics">
      <div class="product-metric">
        <span>Fit</span>
        <strong>${entry.affinityScore}</strong>
      </div>
      <div class="product-metric">
        <span>Friction</span>
        <strong>${entry.riskScore}</strong>
      </div>
      <div class="product-metric">
        <span>Signal</span>
        <strong>${escapeHtml(formatConfidence(entry.confidence))}</strong>
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
  if (isBasicCatalogGame(entry.game)) {
    return `
      <div class="product-reason-grid">
        <div class="product-reason-panel">
          <strong>What I know</strong>
          <ul>
            <li>${escapeHtml(entry.game.primaryGenre ? `Genre: ${entry.game.primaryGenre.replaceAll("_", " ")}` : "Basic title metadata is available.")}</li>
            <li>${escapeHtml(entry.game.availablePlatformNames.length > 0 ? `Platforms: ${entry.game.availablePlatformNames.join(", ")}` : "Platform data is incomplete.")}</li>
          </ul>
        </div>
        <div class="product-reason-panel">
          <strong>What I still need</strong>
          <ul>
            <li>I do not have enough detail to judge this yet.</li>
            <li>Add it to My Games or log an outcome to make future picks sharper.</li>
          </ul>
        </div>
      </div>
    `;
  }

  return `
    <div class="product-reason-grid">
      <div class="product-reason-panel">
        <strong>${escapeHtml(options.fitTitle ?? "Why this could work")}</strong>
        <ul>
          ${entry.fitReasons.length > 0 ? entry.fitReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("") : "<li>I need more games from your history before I can explain this clearly.</li>"}
        </ul>
      </div>
      <div class="product-reason-panel">
        <strong>${escapeHtml(options.cautionTitle ?? "Watch out for")}</strong>
        <ul>
          ${entry.cautionReasons.length > 0 ? entry.cautionReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("") : "<li>Nothing major stands out as a warning.</li>"}
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
            ${isBasicCatalogGame(entry.game) ? renderStatusBadge("Needs more info", "neutral") : renderStatusBadge(frictionLabel(entry.riskScore), entry.riskScore >= HIGH_FRICTION_THRESHOLD ? "negative" : entry.riskScore >= MODERATE_FRICTION_THRESHOLD ? "warning" : "positive")}
            ${isBasicCatalogGame(entry.game) ? "" : renderStatusBadge(formatConfidence(entry.confidence), entry.confidence === "high" ? "positive" : entry.confidence === "medium" ? "accent" : "warning")}
            ${renderStatusBadge(formatAccessStatus(entry), accessTone(entry))}
            ${entry.collectionStatus ? renderStatusBadge(formatCollectionStatus(entry.collectionStatus), collectionTone(entry.collectionStatus)) : ""}
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
          ${createEmptyState("Log a few games you've already played and Playfit will start making recommendations.")}
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
          ${isBasicCatalogGame(entry.game) ? "" : renderStatusBadge(formatConfidence(entry.confidence), entry.confidence === "high" ? "positive" : entry.confidence === "medium" ? "accent" : "warning")}
        </div>
        <h1>${escapeHtml(entry.game.title)}</h1>
        <p class="product-primary-reason">${escapeHtml(getPrimaryReason(entry))}</p>
        ${renderActionButtons(entry.game.gameId, options.primaryAction, options.secondaryActions)}
        <div class="product-decision-meta">
          ${renderStatusBadge(formatAccessStatus(entry), accessTone(entry))}
          ${entry.collectionStatus ? renderStatusBadge(formatCollectionStatus(entry.collectionStatus), collectionTone(entry.collectionStatus)) : ""}
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
          ${isBasicCatalogGame(game) ? "" : renderStatusBadge(frictionLabel(ranked.riskScore), ranked.riskScore >= HIGH_FRICTION_THRESHOLD ? "negative" : ranked.riskScore >= MODERATE_FRICTION_THRESHOLD ? "warning" : "positive")}
        </span>
      </span>
      <span class="product-result-side">
        <span>${escapeHtml(ranked.collectionStatus ? formatCollectionStatus(ranked.collectionStatus) : isBasicCatalogGame(game) ? "Catalog only" : "Taste pick")}</span>
        <span>${escapeHtml(isBasicCatalogGame(game) ? "Ready to save" : formatAccessStatus(ranked))}</span>
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
      ? "Learned: repetition can be a risk"
      : reasons.includes("confusion")
        ? "Learned: confusing systems can hurt"
        : reasons.includes("story") || reasons.includes("emotion")
          ? "Learned: story and emotion matter"
          : reasons.includes("combat")
            ? "Learned: combat feel matters"
            : status === "dropped" || status === "abandoned" || sentiment === "disliked"
              ? "Learned: this was a bad fit"
              : sentiment === "mixed"
                ? "Learned: mixed signal"
                : sentiment === "liked"
                  ? "Learned: strong fit"
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

function renderDecisionQueueItem(
  label: string,
  entry: RankedSeedGame | null,
  primaryAction?: ProductCardAction,
  secondaryAction: ProductCardAction = { label: "Details", action: "open-dossier" },
) {
  if (!entry) {
    return "";
  }

  return `
    <article class="product-compact-card product-decision-queue-item">
      ${renderCoverArt(entry.game, "thumb")}
      <div class="product-compact-main">
        <p class="product-eyebrow">${escapeHtml(label)}</p>
        <h3>${escapeHtml(entry.game.title)}</h3>
        <p class="product-primary-reason">${escapeHtml(getPrimaryReason(entry))}</p>
        <div class="product-chip-list product-chip-list-tight">
          ${renderStatusBadge(getDecisionLabel(entry), getDecisionTone(entry))}
          ${renderStatusBadge(frictionLabel(entry.riskScore), entry.riskScore >= HIGH_FRICTION_THRESHOLD ? "negative" : entry.riskScore >= MODERATE_FRICTION_THRESHOLD ? "warning" : "positive")}
        </div>
      </div>
      <div class="product-compact-actions">
        ${primaryAction ? `<button class="product-button product-button-secondary product-button-sm" data-action="${escapeHtml(primaryAction.action)}" data-game-id="${escapeHtml(entry.game.gameId)}">${escapeHtml(primaryAction.label)}</button>` : ""}
        ${primaryAction?.action === secondaryAction.action ? "" : `<button class="product-button product-button-ghost product-button-sm" data-action="${escapeHtml(secondaryAction.action)}" data-game-id="${escapeHtml(entry.game.gameId)}">${escapeHtml(secondaryAction.label)}</button>`}
      </div>
    </article>
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
                <span class="product-field-hint">List</span>
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
                ? "Games you abandoned, bounced off, or just did not enjoy."
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
                    <span class="product-score">${escapeHtml(game.source === "universe" ? "Broad list" : "Curated")}</span>
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
  { value: "owned", label: "Logged" },
  { value: "wishlist", label: "Wishlist" },
  { value: "not_owned", label: "Not in library" },
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
        <h3>Friction patterns</h3>
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
      <section class="product-card">
        <h3>Watch vs play</h3>
        <div class="product-segmented-control">
          ${priorityOptions.map((value) => `
            <button
              type="button"
              class="product-pill-button${profile.watchVsPlayRisk === value ? " is-selected" : ""}"
              data-action="set-watch-risk"
              data-profile-value="${escapeHtml(value)}"
              aria-pressed="${profile.watchVsPlayRisk === value ? "true" : "false"}"
            >
              ${escapeHtml(value)}
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
    historyQuery: "",
    historySelectedGameId: null,
    activeModal: null,
    modalGameId: null,
    profileMode: "overview",
    dossierGameId: null,
    dossierReturnTab: null,
    statusMessage: null,
    outcomeNotice: null,
    pendingFrictionAction: null,
    startBannerDismissed: false,
    upcomingPlatformFilters: new Set(
      state.user.onboarding.platforms
        .filter((entry) => ["available", "limited"].includes(entry.status))
        .map((entry) => entry.platformId)
    ),
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

  function buildProfileFromCurrentData() {
    return buildAdaptiveProfile(
      state.user.onboarding,
      seedData.gamesById,
      state.user.gameStates,
      state.user.profileOverrides,
    );
  }

  function refreshAdaptiveProfile() {
    if (!state.user.profile || !state.user.onboardingCompletedAt) {
      return;
    }

    state.user.profile = buildProfileFromCurrentData();
  }

  function ensureProfileOverrides(): ProductProfileOverrides {
    state.user.profileOverrides ??= {};
    return state.user.profileOverrides;
  }

  function updateGameState(
    gameId: string,
    updates: {
      status?: ProductGameStatus | null;
      sentiment?: ProductGameSentiment;
      collectionStatus?: ProductCollectionStatus | null;
      ownershipStatus?: ProductOwnershipStatus;
      rating?: number;
      notes?: string;
      source?: "onboarding" | "finder" | "manual";
    },
  ) {
    const game = getSeedGame(gameId);
    if (!game) {
      return;
    }

    const existing = state.user.gameStates[gameId];
    const timestamp = nowIso();
    const nextStatus = updates.status === null ? undefined : updates.status ?? existing?.status;
    let nextCollectionStatus =
      updates.collectionStatus !== undefined
        ? updates.collectionStatus ?? undefined
        : getCollectionStatus(existing) ?? undefined;
    let nextOwnershipStatus = updates.ownershipStatus ?? existing?.ownershipStatus;

    if (updates.status && isPlayStatus(updates.status) && nextCollectionStatus === "wishlist") {
      nextCollectionStatus = undefined;
    }

    if (nextCollectionStatus === "wishlist" && isPlayStatus(nextStatus)) {
      nextCollectionStatus = undefined;
    }

    if (nextCollectionStatus === "wishlist") {
      nextOwnershipStatus = "wishlist";
    } else if (nextCollectionStatus === "backlog") {
      nextOwnershipStatus = nextOwnershipStatus === "wishlist" ? "owned" : nextOwnershipStatus ?? "owned";
    }

    if (updates.status && isPlayStatus(updates.status)) {
      nextOwnershipStatus = "owned";
    }

    state.user.gameStates[gameId] = {
      gameId,
      title: game.title,
      source: updates.source ?? existing?.source ?? "manual",
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      sentiment: updates.sentiment ?? existing?.sentiment,
      status: nextStatus,
      collectionStatus: nextCollectionStatus,
      ownershipStatus: nextOwnershipStatus,
      rating: updates.rating ?? existing?.rating,
      notes: updates.notes ?? existing?.notes,
    };

    if (updates.sentiment || ["beaten", "completed", "dropped", "abandoned", "dismissed"].includes(nextStatus ?? "")) {
      refreshAdaptiveProfile();
    }
  }

  function addFinderAction(gameId: string, action: FinderActionType) {
    state.user.finderActions[gameId] = {
      gameId,
      action,
      createdAt: nowIso(),
    };
  }

  function showOutcomeNotice(game: SeedGame, status: ProductOutcomeNotice["status"], sentiment: ProductGameSentiment) {
    ui.outcomeNotice = {
      gameId: game.gameId,
      title: game.title,
      status,
      sentiment,
    };
    ui.activeTab = "today";
    ui.dossierGameId = null;
    ui.dossierReturnTab = null;
    closeModal();
    setStatusMessage(null);
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

  function openModal(modal: ProductModal, gameId: string | null = null) {
    ui.activeModal = modal;
    ui.modalGameId = gameId;
    setStatusMessage(null);
  }

  function closeModal() {
    ui.activeModal = null;
    ui.modalGameId = null;
    ui.pendingFrictionAction = null;
  }

  function getRankedGame(gameId: string) {
    const profile = state.user.profile;
    const game = getSeedGame(gameId);

    if (!profile || !game) {
      return null;
    }

    return scoreSeedGame(game, state, profile, seedData.gamesById);
  }

  function shouldConfirmFrictionAction(gameId: string) {
    const ranked = getRankedGame(gameId);
    return Boolean(ranked && !isBasicCatalogGame(ranked.game) && ranked.riskScore >= HIGH_FRICTION_THRESHOLD);
  }

  function openFrictionConfirmation(gameId: string, action: FrictionGuardedAction) {
    ui.pendingFrictionAction = { gameId, action };
    openModal("friction-confirm", gameId);
  }

  function renderFrictionConfirmContent() {
    const pending = ui.pendingFrictionAction;
    const ranked = pending ? getRankedGame(pending.gameId) : null;

    if (!pending || !ranked) {
      return createEmptyState("I cannot check this decision right now.");
    }

    const actionLabel: Record<FrictionGuardedAction, string> = {
      "set-current-run": "set it as playing",
      "add-backlog": "add it to backlog",
      "mark-wishlist": "add it to wishlist",
    };

    return `
      <div class="product-modal-body">
        <div class="product-modal-game">
          ${renderCoverArt(ranked.game, "thumb")}
          <div>
            <strong>${escapeHtml(ranked.game.title)}</strong>
            <p class="product-note">This has high friction for your current profile. You can still ${escapeHtml(actionLabel[pending.action])}, but I want to make the tradeoff clear.</p>
          </div>
        </div>
        <div class="product-chip-list product-chip-list-tight">
          ${renderStatusBadge(frictionLabel(ranked.riskScore), "negative")}
          ${renderStatusBadge(formatConfidence(ranked.confidence), ranked.confidence === "high" ? "positive" : ranked.confidence === "medium" ? "accent" : "warning")}
        </div>
        ${renderReasonsBlock(ranked, { cautionTitle: "Why I am cautious" })}
        <div class="product-action-row">
          <button class="product-button product-button-primary" data-action="confirm-friction-action">Do it anyway</button>
          <button class="product-button product-button-ghost" data-action="close-modal">Cancel</button>
        </div>
      </div>
    `;
  }

  function renderCompletionModalContent(gameId: string) {
    const game = getSeedGame(gameId);
    const sentiment = state.user.gameStates[gameId]?.sentiment;

    if (!game) {
      return createEmptyState("I cannot find this game in the catalog.");
    }

    return `
      <div class="product-modal-body">
        <div class="product-modal-game">
          ${renderCoverArt(game, "thumb")}
          <div>
            <strong>${escapeHtml(game.title)}</strong>
            <p class="product-note">${
              sentiment
                ? `Current note: ${escapeHtml(formatCompletionOutcome(sentiment))}.`
                : "Choose the outcome that best matches how it landed for you."
            }</p>
          </div>
        </div>
        <div class="product-action-row">
          <button class="product-button product-button-primary" data-action="complete-game" data-game-id="${escapeHtml(gameId)}" data-sentiment="liked">Loved it</button>
          <button class="product-button product-button-secondary" data-action="complete-game" data-game-id="${escapeHtml(gameId)}" data-sentiment="mixed">Mixed feelings</button>
          <button class="product-button product-button-ghost" data-action="complete-game" data-game-id="${escapeHtml(gameId)}" data-sentiment="disliked">Didn't click</button>
        </div>
      </div>
    `;
  }

  function renderDropModalContent(gameId: string) {
    const game = getSeedGame(gameId);

    if (!game) {
      return createEmptyState("I cannot find this game in the catalog.");
    }

    return `
      <div class="product-modal-body">
        <div class="product-modal-game">
          ${renderCoverArt(game, "thumb")}
          <div>
            <strong>${escapeHtml(game.title)}</strong>
            <p class="product-note">I will keep this in mind and avoid similar friction later.</p>
          </div>
        </div>
        <div class="product-action-row">
          <button class="product-button product-button-primary" data-action="confirm-drop-run" data-game-id="${escapeHtml(gameId)}">Mark abandoned</button>
          <button class="product-button product-button-ghost" data-action="close-modal">Keep playing</button>
        </div>
      </div>
    `;
  }

  function renderRecalibrateModalContent() {
    return `
      <div class="product-modal-body">
        <p class="product-tagline">This rebuilds your taste profile from setup answers, My Games outcomes, and your manual edits.</p>
        <div class="product-action-row">
          <button class="product-button product-button-primary" data-action="confirm-recalibrate-profile">Refresh profile</button>
          <button class="product-button product-button-ghost" data-action="close-modal">Cancel</button>
        </div>
      </div>
    `;
  }

  function renderModalShell(title: string, body: string, eyebrow = "Quick action") {
    return `
      <div class="product-modal-layer" role="presentation">
        <button class="product-modal-backdrop" data-action="close-modal" aria-label="Close dialog"></button>
        <section class="product-modal product-sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
          <div class="product-modal-head">
            <div>
              <p class="product-eyebrow">${escapeHtml(eyebrow)}</p>
              <h2>${escapeHtml(title)}</h2>
            </div>
            <button class="product-modal-close" data-action="close-modal" aria-label="Close">&times;</button>
          </div>
          ${body}
        </section>
      </div>
    `;
  }

  function renderActiveModal() {
    if (!ui.activeModal) {
      return "";
    }

    if (ui.activeModal === "history-log") {
      return renderModalShell("Add a game", renderHistoryLogger({ framed: false }), "My Games");
    }

    if (ui.activeModal === "library-edit" && ui.modalGameId) {
      return renderModalShell("Edit game", renderLibraryEditForm(ui.modalGameId), "My Games");
    }

    if (ui.activeModal === "completion" && ui.modalGameId) {
      return renderModalShell("How did it end?", renderCompletionModalContent(ui.modalGameId), "Outcome");
    }

    if (ui.activeModal === "drop" && ui.modalGameId) {
      return renderModalShell("Stop playing?", renderDropModalContent(ui.modalGameId), "Outcome");
    }

    if (ui.activeModal === "recalibrate") {
      return renderModalShell("Refresh profile?", renderRecalibrateModalContent(), "Profile");
    }

    if (ui.activeModal === "friction-confirm") {
      return renderModalShell("High friction", renderFrictionConfirmContent(), "Decision check");
    }

    return "";
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
            <p class="product-tagline">Pick the platforms you can use right now. Today will focus on games you can actually play.</p>
          </div>
          <div class="product-platform-grid">${platformRows}</div>
        </div>
      `;
    }

    if (draft.step === "anchors") {
      const likedCount = draft.likedGameIds.length;
      const dislikedCount = draft.dislikedGameIds.length;
      const likedDone = likedCount >= 3;
      stepMarkup = `
        <div class="product-grid">
          <div class="product-step-head">
            <p class="product-eyebrow">Step 2 of 4</p>
            <h1>Tell me what has worked before</h1>
            <p class="product-tagline">Add 3 games you loved. Optional: games that failed for you.</p>
            <div class="product-anchor-progress">
              <span class="product-chip ${likedDone ? "product-chip-positive" : ""}">${likedCount}/3 loved</span>
              <span class="product-chip ${dislikedCount > 0 ? "product-chip-positive" : ""}">${dislikedCount} optional not-for-me</span>
            </div>
          </div>
          <div class="product-anchor-grid">
            ${renderAnchorSelector("Games you loved or finished", "liked", ui.onboardingSearch.liked, draft.likedGameIds, seedData.gamesById, likedResults, draft.currentGameId, draft.anchorReasons, draft.anchorOwnership)}
            ${renderAnchorSelector("Games that did not click", "disliked", ui.onboardingSearch.disliked, draft.dislikedGameIds, seedData.gamesById, dislikedResults, draft.currentGameId, draft.anchorReasons, draft.anchorOwnership)}
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
            <h1>What makes a game worth your time?</h1>
            <p class="product-tagline">Pick what matters most. In private mode, chips drive the profile; text is only context you can refine later.</p>
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
                <h1>Here is what I learned</h1>
                <p class="product-tagline">${escapeHtml(profile.summary)}</p>
                <p class="product-note">Adjust anything that feels off before you see your first picks.</p>
              </div>
              ${renderProfileEditor(profile)}
              <div class="product-actions">
                <button class="product-button product-button-primary" data-action="confirm-profile">Let's go</button>
                <button class="product-button product-button-secondary" data-action="generate-profile">Refresh from answers</button>
              </div>
            </div>
          `
        : `
            <div class="product-grid">
              <div class="product-step-head">
                <p class="product-eyebrow">Step 4 of 4 · Last step</p>
                <h1>Build your starting profile</h1>
                <p class="product-tagline">I will turn your answers into a first set of picks. Takes just a second.</p>
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
        ${alreadyOnboarded ? `<p class="product-gate-message" style="border-color: rgba(91,211,208,0.3); background: rgba(91,211,208,0.06); color: var(--text-secondary);">You already have a profile. To apply setup changes, go to the last step and refresh it.</p>` : ""}
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

  function renderHistoryLogger(options: { framed?: boolean } = {}) {
    const framed = options.framed ?? true;
    const results = ui.historyQuery.trim().length > 0
      ? searchSeedGames(seedData.allGames, ui.historyQuery, finderIndex).slice(0, 6)
      : [];

    const selected = ui.historySelectedGameId
      ? seedData.gamesById.get(ui.historySelectedGameId) ?? null
      : null;

    const selectedState = selected ? state.user.gameStates[selected.gameId] : null;
    const alreadyLogged = ["beaten", "completed", "dropped", "abandoned"].includes(selectedState?.status ?? "");

    return `
      <section class="${framed ? "product-card " : ""}product-history-logger${framed ? "" : " product-history-logger-modal"}">
        <div class="product-section-head">
          <h2>Log a game you've played</h2>
          <p class="product-note">Every result helps me understand what actually works for you.</p>
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
              const badge = gs?.status === "completed" || gs?.status === "beaten"
                ? `<span class="product-chip product-chip-positive">Logged</span>`
                : gs?.status === "dropped" || gs?.status === "abandoned"
                  ? `<span class="product-chip product-chip-negative">Abandoned</span>`
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
            <p class="product-note">How did it land?</p>
            <div class="product-actions">
              <button class="product-button product-button-primary" data-action="log-history-game" data-game-id="${escapeHtml(selected.gameId)}" data-sentiment="liked" data-status="completed">Completed 100%</button>
              <button class="product-button product-button-secondary" data-action="log-history-game" data-game-id="${escapeHtml(selected.gameId)}" data-sentiment="liked" data-status="beaten">Finished story</button>
              <button class="product-button product-button-secondary" data-action="log-history-game" data-game-id="${escapeHtml(selected.gameId)}" data-sentiment="mixed" data-status="completed">Mixed</button>
              <button class="product-button product-button-ghost" data-action="log-history-game" data-game-id="${escapeHtml(selected.gameId)}" data-sentiment="disliked" data-status="abandoned">Abandoned</button>
            </div>
            <button class="product-button product-button-ghost" data-action="clear-history-selection">Cancel</button>
          </div>
        ` : ""}
      </section>
    `;
  }

  function renderLibraryEditForm(gameId: string) {
    const editGame = seedData.gamesById.get(gameId);
    const editGs = state.user.gameStates[gameId];

    if (!editGame) {
      return createEmptyState("I cannot find this game in the catalog.");
    }

    const editCollectionStatus = getCollectionStatus(editGs);
    const hasPlayState = isPlayStatus(editGs?.status);

    return `
      <div class="product-modal-body product-library-edit-body">
        <div class="product-modal-game">
          ${renderCoverArt(editGame, "thumb")}
          <div>
            <strong>${escapeHtml(editGame.title)}</strong>
            <p class="product-meta">${escapeHtml(editGame.series || editGame.primaryGenre)}</p>
          </div>
        </div>
        <p class="product-note">Update status, lists, and rating. Future picks will use this immediately.</p>
        <span class="product-field-hint">Status</span>
        <div class="product-action-row">
          <button class="product-button product-button-primary" data-action="set-current-run" data-game-id="${escapeHtml(gameId)}">Playing</button>
          <button class="product-button product-button-secondary" data-action="shelve-game" data-game-id="${escapeHtml(gameId)}">Shelve</button>
          <button class="product-button product-button-ghost" data-action="log-history-game" data-game-id="${escapeHtml(gameId)}" data-sentiment="liked" data-status="beaten">Finished story</button>
          <button class="product-button product-button-ghost" data-action="log-history-game" data-game-id="${escapeHtml(gameId)}" data-sentiment="liked" data-status="completed">Completed 100%</button>
          <button class="product-button product-button-ghost" data-action="log-history-game" data-game-id="${escapeHtml(gameId)}" data-sentiment="disliked" data-status="abandoned">Abandoned</button>
        </div>
        <span class="product-field-hint">Lists</span>
        <div class="product-action-row product-action-row-subtle">
          <button class="product-button ${editCollectionStatus === "backlog" ? "product-button-secondary" : "product-button-ghost"}" data-action="${editCollectionStatus === "backlog" ? "remove-backlog" : "add-backlog"}" data-game-id="${escapeHtml(gameId)}">${editCollectionStatus === "backlog" ? "In backlog" : "Add to backlog"}</button>
          ${
            hasPlayState
              ? ""
              : `<button class="product-button ${editCollectionStatus === "wishlist" ? "product-button-secondary" : "product-button-ghost"}" data-action="${editCollectionStatus === "wishlist" ? "remove-wishlist" : "mark-wishlist"}" data-game-id="${escapeHtml(gameId)}">${editCollectionStatus === "wishlist" ? "In wishlist" : "Add to wishlist"}</button>`
          }
        </div>
        <div class="product-rating-row" aria-label="Rating">
          <span class="product-field-hint">Rating</span>
          ${[1, 2, 3, 4, 5].map((rating) => `<button class="product-star-button${editGs?.rating === rating ? " is-active" : ""}" data-action="rate-game" data-game-id="${escapeHtml(gameId)}" data-rating="${rating}" aria-label="${rating} stars">${rating <= (editGs?.rating ?? 0) ? "★" : "☆"}</button>`).join("")}
          ${editGs?.rating ? `<button class="product-button product-button-ghost product-button-sm" data-action="clear-rating" data-game-id="${escapeHtml(gameId)}">Clear</button>` : ""}
        </div>
        <div class="product-action-row product-action-row-subtle">
          <button class="product-button product-button-ghost" data-action="remove-library-game" data-game-id="${escapeHtml(gameId)}">Remove from my games</button>
        </div>
      </div>
    `;
  }

  function renderDossierActionPanel(entry: RankedSeedGame) {
    const gameState = state.user.gameStates[entry.game.gameId];
    const isReleased = entry.game.releaseState === "released";
    const statusLabel = formatGameStatus(gameState?.status);
    const collectionStatus = getCollectionStatus(gameState);
    const collectionLabel = formatCollectionStatus(collectionStatus);
    const hasPlayState = isPlayStatus(gameState?.status);
    const ratingLabel = gameState?.rating ? `★ ${gameState.rating}` : "";

    return `
      <div class="product-dossier-action-panel">
        <div class="product-chip-list product-chip-list-tight">
          ${statusLabel ? renderStatusBadge(statusLabel, gameState?.status === "abandoned" || gameState?.status === "dropped" || gameState?.status === "dismissed" ? "negative" : gameState?.status === "completed" || gameState?.status === "beaten" ? "positive" : "accent") : ""}
          ${collectionLabel ? renderStatusBadge(collectionLabel, collectionTone(collectionStatus)) : ""}
          ${ratingLabel ? renderStatusBadge(ratingLabel, "accent") : ""}
        </div>
        <div class="product-state-actions">
          <div class="product-action-group">
            <span class="product-field-hint">Status</span>
            ${isReleased ? `<button class="product-button product-button-primary" data-action="set-current-run" data-game-id="${escapeHtml(entry.game.gameId)}">${gameState?.status === "playing" ? "Keep playing" : "Set as playing"}</button>` : ""}
            ${isReleased ? `<button class="product-button product-button-ghost" data-action="shelve-game" data-game-id="${escapeHtml(entry.game.gameId)}">Shelve</button>` : ""}
          </div>
          <div class="product-action-group">
            <span class="product-field-hint">Lists</span>
            ${isReleased ? `<button class="product-button product-button-secondary" data-action="${collectionStatus === "backlog" ? "remove-backlog" : "add-backlog"}" data-game-id="${escapeHtml(entry.game.gameId)}">${collectionStatus === "backlog" ? "In backlog" : "Add to backlog"}</button>` : ""}
            ${isReleased && !hasPlayState ? `<button class="product-button product-button-secondary" data-action="${collectionStatus === "wishlist" ? "remove-wishlist" : "mark-wishlist"}" data-game-id="${escapeHtml(entry.game.gameId)}">${collectionStatus === "wishlist" ? "In wishlist" : "Add to wishlist"}</button>` : ""}
            ${!isReleased ? `<button class="product-button product-button-secondary" data-action="track-release" data-game-id="${escapeHtml(entry.game.gameId)}">Watch release</button>` : ""}
          </div>
          <div class="product-action-group">
            <span class="product-field-hint">Outcome</span>
            ${isReleased ? `<button class="product-button product-button-ghost" data-action="mark-beaten" data-game-id="${escapeHtml(entry.game.gameId)}">Finished story</button>` : ""}
            ${isReleased ? `<button class="product-button product-button-ghost" data-action="open-completion-picker" data-game-id="${escapeHtml(entry.game.gameId)}">Completed 100%</button>` : ""}
            ${isReleased ? `<button class="product-button product-button-ghost" data-action="open-drop-picker" data-game-id="${escapeHtml(entry.game.gameId)}">Abandoned</button>` : ""}
            ${gameState?.status !== "completed" ? `<button class="product-button product-button-ghost" data-action="dismiss-game" data-game-id="${escapeHtml(entry.game.gameId)}">Not for me</button>` : ""}
          </div>
        </div>
        <p class="product-note">${isBasicCatalogGame(entry.game) ? "Save it or log an outcome first. I need more detail before judging it." : "Actions here update My Games and shape future picks."}</p>
      </div>
    `;
  }

  function renderOutcomeNotice(model: ProductTodayModel) {
    const notice = ui.outcomeNotice;
    if (!notice) {
      return "";
    }

    const sentimentLabel = notice.sentiment === "liked"
      ? "Loved"
      : notice.sentiment === "mixed"
        ? "Mixed"
        : "Did not click";
    const statusLabel = notice.status === "abandoned"
      ? "Abandoned"
      : notice.status === "beaten"
        ? "Finished story"
        : "Completed 100%";
    const nextDecision = model.currentRun ?? model.nextUp ?? model.resume ?? model.wishlistFit ?? model.worthTracking ?? model.playableAlternative;
    const nextCopy = nextDecision
      ? `Your next best option is ${nextDecision.game.title}.`
      : "Add another game when you are ready and the queue will get sharper.";

    return `
      <section class="product-outcome-panel">
        <div class="product-outcome-main">
          <p class="product-eyebrow">Saved to your games</p>
          <h2>${escapeHtml(notice.title)} is now ${escapeHtml(statusLabel)}</h2>
          <p class="product-tagline">${escapeHtml(sentimentLabel)} saved. I will use this to make the next picks more personal.</p>
          <div class="product-chip-list product-chip-list-tight">
            ${renderStatusBadge(statusLabel, notice.status === "abandoned" ? "negative" : "positive")}
            ${renderStatusBadge(sentimentLabel, notice.sentiment === "liked" ? "positive" : notice.sentiment === "mixed" ? "warning" : "negative")}
            ${renderStatusBadge("Next picks updated", "accent")}
          </div>
          <p class="product-note">${escapeHtml(nextCopy)}</p>
        </div>
        <div class="product-outcome-actions">
          ${nextDecision ? `<button class="product-button product-button-primary" data-action="open-dossier" data-game-id="${escapeHtml(nextDecision.game.gameId)}">See next pick</button>` : ""}
          <button class="product-button product-button-secondary" data-action="switch-tab" data-tab="library">View in My Games</button>
          <button class="product-button product-button-ghost" data-action="dismiss-outcome-notice">Dismiss</button>
        </div>
      </section>
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
          ? "My Games"
          : returnTab === "upcoming"
            ? "Upcoming"
            : "Profile";

    if (!profile || !game) {
      return createEmptyState("I cannot open this game yet.", `Back to ${returnLabel}`, "close-dossier");
    }

    const ranked = scoreSeedGame(game, state, profile, seedData.gamesById);
    const dossierMeta = `Platforms: ${ranked.game.availablePlatformNames.join(", ") || "Unknown"}${ranked.game.releaseYear ? ` · ${ranked.game.releaseYear}` : ""}${ranked.game.sourceRef ? ` · ${ranked.game.sourceRef}` : ""}`;

    return `
      <section class="product-grid product-dossier-screen">
        <button class="product-button product-button-ghost product-back-button" data-action="close-dossier">← Back to ${escapeHtml(returnLabel)}</button>
        ${renderGameDossier("Why this pick", ranked, {
          summary: summarizeRankedGame(ranked),
          detailMeta: dossierMeta,
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
    const hero = model.currentRun ?? model.nextUp ?? model.resume ?? model.wishlistFit ?? model.worthTracking;
    const heading = model.currentRun
      ? "Main focus"
      : model.nextUp
        ? "Play next"
        : model.resume
          ? "Resume"
          : model.wishlistFit
            ? "Worth adding"
            : model.worthTracking
              ? "Worth tracking"
              : "Today";
    const heroCollectionStatus = hero ? getCollectionStatus(state.user.gameStates[hero.game.gameId]) : null;
    const heroHasPlayState = hero ? isPlayStatus(state.user.gameStates[hero.game.gameId]?.status) : false;
    const heroCanPlay = hero?.accessStatus === "playable";
    const heroIsTrackingFallback = !model.currentRun && !model.nextUp && !model.resume && !model.wishlistFit && !!model.worthTracking;
    const earlyReadNotice = hero && hero.confidence === "low"
      ? `<p class="product-note product-early-read">Early read. Log a few outcomes and I'll get more decisive.</p>`
      : "";
    const alsoPlayingItems = model.playingNow.filter(
      (entry) => entry.game.gameId !== model.currentRun?.game.gameId,
    );
    const alsoPlayingMarkup = alsoPlayingItems
      .map((entry) => renderDecisionQueueItem("Also playing", entry, { label: "Update", action: "open-dossier" }))
      .join("");
    const heroSecondaryActions = hero
      ? [
          heroCanPlay
            ? heroCollectionStatus === "backlog"
              ? { label: "In backlog", action: "remove-backlog" }
              : { label: "Add to backlog", action: "add-backlog" }
            : null,
          !heroHasPlayState
            ? heroCollectionStatus === "wishlist"
              ? { label: "In wishlist", action: "remove-wishlist" }
              : { label: "Add to wishlist", action: "mark-wishlist" }
            : null,
        ].filter((item): item is ProductCardAction => Boolean(item))
      : [];
    const queueItems = [
      ["Play next", model.currentRun ? model.nextUp : null],
      ["Resume", model.resume],
      ["Worth adding", model.wishlistFit],
      ["Worth tracking", model.worthTracking],
    ]
      .filter((item): item is [string, RankedSeedGame] => Boolean(item[1]))
      .filter(([, entry]) => entry.game.gameId !== hero?.game.gameId)
      .slice(0, 3)
      .map(([label, entry]) => renderDecisionQueueItem(label, entry, { label: "See why", action: "open-dossier" }))
      .join("");

    const postOnboardingHint = heroIsTrackingFallback && !ui.startBannerDismissed ? `
      <section class="product-card product-start-banner">
        <button class="product-start-banner-close" data-action="dismiss-start-banner" aria-label="Dismiss">✕</button>
        <p class="product-note"><strong>Getting started:</strong> Track it for later, or add playable games to My Games so Today can make sharper calls.</p>
      </section>
    ` : "";

    return `
      <section class="product-page-stack">
        ${renderOutcomeNotice(model)}
        ${postOnboardingHint}
        ${renderRankedGameCard(heading, hero, {
          emphasis: "hero",
          primaryAction: model.currentRun
            ? { label: "Update status", action: "open-dossier" }
            : heroIsTrackingFallback && hero
              ? {
                  label: "See why",
                  action: "open-dossier",
                }
              : hero
                ? { label: "See why", action: "open-dossier" }
                : undefined,
          secondaryActions:
            model.currentRun
              ? [{ label: "Shelve", action: "pause-run" }, ...heroSecondaryActions]
              : heroSecondaryActions,
          extraContent: earlyReadNotice,
        })}
        ${alsoPlayingMarkup ? `
          <section class="product-decision-queue product-playing-now-list">
            <div class="product-section-header">
              <div>
                <p class="product-eyebrow">Also playing</p>
                <h2>In progress</h2>
              </div>
              <p class="product-note">Parallel games stay visible without replacing the main focus.</p>
            </div>
            <div class="product-decision-queue-list">${alsoPlayingMarkup}</div>
          </section>
        ` : ""}
        ${queueItems ? `
          <section class="product-decision-queue">
            <div class="product-section-header">
              <div>
                <p class="product-eyebrow">Other good calls</p>
                <h2>Next options</h2>
              </div>
              <p class="product-note">A few alternatives if the main pick is not right today.</p>
            </div>
            <div class="product-decision-queue-list">${queueItems}</div>
          </section>
        ` : ""}
      </section>
    `;
  }

  function renderLibrary() {
    const allGameStates = Object.entries(state.user.gameStates);

    const sections: Array<{
      heading: string;
      filter: (gs: { status?: ProductGameStatus; collectionStatus?: ProductCollectionStatus; ownershipStatus?: ProductOwnershipStatus; sentiment?: string }) => boolean;
      sentimentBadge: boolean;
    }> = [
      { heading: "Playing now", filter: (gs) => gs.status === "playing", sentimentBadge: false },
      {
        heading: "Backlog",
        filter: (gs) =>
          getCollectionStatus(gs) === "backlog" &&
          !["beaten", "completed", "abandoned", "dropped", "dismissed"].includes(gs.status ?? ""),
        sentimentBadge: false,
      },
      { heading: "Wishlist", filter: (gs) => getCollectionStatus(gs) === "wishlist" && !isPlayStatus(gs.status), sentimentBadge: false },
      { heading: "Shelved", filter: (gs) => gs.status === "shelved" || gs.status === "on_hold", sentimentBadge: false },
      { heading: "Finished", filter: (gs) => gs.status === "beaten" || gs.status === "completed", sentimentBadge: true },
      { heading: "Abandoned", filter: (gs) => gs.status === "abandoned" || gs.status === "dropped", sentimentBadge: false },
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

    const totalLogged = allGameStates.filter(([, gs]) =>
      ["playing", "backlog", "interested", "shelved", "on_hold", "beaten", "completed", "dropped", "abandoned"].includes(
        gs.status ?? "",
      ) || Boolean(getCollectionStatus(gs)),
    ).length;

    const statusLabel: Record<string, string> = {
      playing: "Playing",
      backlog: "Backlog",
      on_hold: "Shelved",
      shelved: "Shelved",
      interested: "Backlog",
      beaten: "Finished story",
      completed: "Completed 100%",
      dropped: "Abandoned",
      abandoned: "Abandoned",
      dismissed: "Not for me",
    };
    const statusTone: Record<string, StatusTone> = {
      playing: "accent",
      on_hold: "warning",
      shelved: "warning",
      backlog: "accent",
      completed: "positive",
      beaten: "positive",
      dropped: "negative",
      abandoned: "negative",
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
            const rowCollectionStatus = getCollectionStatus(gs);
            const badges = [
              gs.status && gs.status !== "backlog" && gs.status !== "interested" ? renderStatusBadge(statusLabel[gs.status] ?? gs.status, statusTone[gs.status] ?? "neutral") : "",
              rowCollectionStatus ? renderStatusBadge(formatCollectionStatus(rowCollectionStatus), collectionTone(rowCollectionStatus)) : "",
              sentimentBadge && gs.sentiment
                ? renderStatusBadge(sentimentLabel[gs.sentiment] ?? gs.sentiment, sentimentChipKind[gs.sentiment] ?? "warning")
                : "",
              gs.rating ? renderStatusBadge(`★ ${gs.rating}`, "accent") : "",
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

    return `
      <section class="product-page-stack">
        <section class="product-card product-library">
          <div class="product-page-header product-page-header-row">
            <div>
              <p class="product-eyebrow">My Games</p>
              <h2>Your games</h2>
              ${totalLogged > 0 ? `<p class="product-note">${totalLogged} game${totalLogged !== 1 ? "s" : ""} saved. Each one sharpens future picks.</p>` : ""}
            </div>
            <button class="product-button product-button-primary" data-action="open-history-log">Add a game</button>
          </div>
          ${sectionsHtml || createEmptyState("No games yet. Add something you played and your picks will get sharper immediately.", "Go to Today", "go-today")}
        </section>
      </section>
    `;
  }

  function renderProfile() {
    const rawProfile = state.user.profile;

    if (!rawProfile) {
      return createEmptyState(
        "Finish setup first so your taste profile can be edited here.",
        "Open setup",
        "go-setup",
      );
    }

    const profile = normalizeProfileSignals(rawProfile);
    const positiveSignals = profile.signals.filter((signal) => signal.tone === "positive");
    const negativeSignals = profile.signals.filter((signal) => signal.tone === "negative");
    const loggedCount = Object.values(state.user.gameStates).filter((gs) =>
      ["playing", "backlog", "interested", "shelved", "on_hold", "beaten", "completed", "dropped", "abandoned"].includes(
        gs.status ?? "",
      ),
    ).length;
    const confidenceLabel =
      loggedCount >= 8
        ? "Clear picture"
        : loggedCount >= 4
          ? "Good read"
          : "Still learning";
    if (ui.profileMode === "edit") {
      return `
        <section class="product-page-stack product-profile-edit-screen">
          <button class="product-button product-button-ghost product-back-button" data-action="close-profile-edit">← Back to Profile</button>
          <section class="product-card product-profile-overview">
            <div class="product-page-header">
              <p class="product-eyebrow">Edit your taste</p>
              <h2>Tune what matters</h2>
              <p class="product-tagline">Change what matters most. New picks update right away.</p>
            </div>
          </section>
          ${renderProfileEditor(profile)}
          <section class="product-card product-recalibrate">
            <div class="product-recalibrate-body">
              <div>
                <strong>Refresh from your history</strong>
                <p class="product-note">Rebuild from setup answers, My Games outcomes, and manual edits.</p>
              </div>
              <button class="product-button product-button-secondary" data-action="recalibrate-profile">Refresh profile</button>
            </div>
          </section>
        </section>
      `;
    }

    return `
      <section class="product-page-stack">
        <section class="product-card product-profile-overview">
          <div class="product-page-header product-page-header-row">
            <div>
              <p class="product-eyebrow">Your taste</p>
              <h2>Your profile</h2>
              <p class="product-tagline">${escapeHtml(profile.summary)}</p>
              <p class="product-note">Based on your setup and the games you have saved.</p>
            </div>
            <button class="product-button product-button-primary" data-action="open-profile-edit">Edit taste profile</button>
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
              <span class="product-eyebrow">How certain I am</span>
              <strong>${escapeHtml(confidenceLabel)}</strong>
              <p class="product-note">${loggedCount} saved game${loggedCount === 1 ? "" : "s"} behind these picks.</p>
              ${renderStatusBadge(profile.watchVsPlayRisk === "high" ? "Some games may read better than they play" : "Playable picks prioritized", profile.watchVsPlayRisk === "high" ? "warning" : "positive")}
            </article>
          </div>
        </section>
      </section>
    `;
  }

  function renderUpcoming() {
    if (!state.user.profile) {
      return createEmptyState(
        "Finish setup first so upcoming releases can be checked against your taste.",
        "Open setup",
        "go-setup",
      );
    }

    const activeFilters = ui.upcomingPlatformFilters;
    const userOwnedPlatforms = new Set(
      state.user.onboarding.platforms
        .filter((entry) => ["available", "limited"].includes(entry.status))
        .map((entry) => entry.platformId)
    );

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const dd = String(tomorrow.getDate()).padStart(2, "0");
    const tomorrowStr = `${yyyy}-${mm}-${dd}`;

    const scoredGames = seedData.allGames
      .filter((game) => game.releaseState === "unreleased")
      .filter((game) => !isBasicCatalogGame(game))
      .filter((game) => {
        if (!game.sortDate || game.sortDate === "TBA") return true;
        return game.sortDate >= tomorrowStr;
      })
      .map((game) => scoreSeedGame(game, state, state.user.profile!, seedData.gamesById))
      .filter((entry) => state.user.gameStates[entry.game.gameId]?.status !== "dismissed");

    const filteredGames = scoredGames.filter((entry) => {
      if (activeFilters.size === 0) return true;
      if (entry.game.availablePlatformIds.length === 0) return true;
      return entry.game.availablePlatformIds.some((pId) => activeFilters.has(pId));
    });

    const isExactDate = (entry: RankedSeedGame) => {
      const label = entry.game.releaseLabel ?? "";
      return label !== "" && label !== "TBA" && !/^\d{4}$/.test(label);
    };

    // Confirmed Dates (Current Year: 2026)
    const confirmed = filteredGames.filter(
      (entry) => isExactDate(entry) && entry.game.sortDate?.startsWith("2026")
    );
    confirmed.sort((left, right) => (left.game.sortDate ?? "").localeCompare(right.game.sortDate ?? ""));

    // Expected in 2026 (Dates TBA)
    const expectedTba = filteredGames.filter(
      (entry) => !isExactDate(entry) && (entry.game.sortDate?.startsWith("2026") || entry.game.releaseLabel === "2026")
    );
    expectedTba.sort((left, right) => right.affinityScore - left.affinityScore);

    // Future & TBA (2027+)
    const futureOrTba = filteredGames.filter((entry) => {
      const isConfirmed2026 = isExactDate(entry) && entry.game.sortDate?.startsWith("2026");
      const isExpected2026 = !isExactDate(entry) && (entry.game.sortDate?.startsWith("2026") || entry.game.releaseLabel === "2026");
      return !isConfirmed2026 && !isExpected2026;
    });
    futureOrTba.sort((left, right) => {
      const dateLeft = left.game.sortDate ?? "";
      const dateRight = right.game.sortDate ?? "";
      if (dateLeft === "TBA" && dateRight !== "TBA") return 1;
      if (dateLeft !== "TBA" && dateRight === "TBA") return -1;
      return dateLeft.localeCompare(dateRight) || right.affinityScore - left.affinityScore;
    });

    const platformFiltersMarkup = seedData.platforms.map((p) => {
      const active = ui.upcomingPlatformFilters.has(p.platformId);
      const activeClass = active ? "is-active" : "is-inactive";

      let icon = "🎮";
      if (p.platformId.includes("ps") || p.platformId.includes("playstation")) icon = "🔵";
      else if (p.platformId.includes("xbox")) icon = "🟢";
      else if (p.platformId.includes("switch") || p.platformId.includes("nintendo")) icon = "🔴";
      else if (p.platformId.includes("pc") || p.platformId.includes("windows")) icon = "💻";

      return `
        <button
          type="button"
          class="product-justwatch-filter-button ${activeClass}"
          data-action="toggle-upcoming-platform"
          data-platform-id="${escapeHtml(p.platformId)}"
          aria-pressed="${active ? "true" : "false"}"
        >
          <span class="platform-filter-icon">${icon}</span>
          <span class="platform-filter-name">${escapeHtml(p.displayName)}</span>
        </button>
      `;
    }).join("");

    const filterActionsMarkup = `
      <div class="product-filter-actions">
        <button type="button" class="product-button product-button-ghost product-button-sm" data-action="show-all-upcoming-platforms">Show All</button>
        <button type="button" class="product-button product-button-ghost product-button-sm" data-action="reset-upcoming-platforms">My Platforms</button>
      </div>
    `;

    const filterContainer = `
      <div class="product-upcoming-filters-bar">
        <span class="product-filter-label">Filter by platform:</span>
        <div class="product-justwatch-filters">
          ${platformFiltersMarkup}
        </div>
        ${filterActionsMarkup}
      </div>
    `;

    const renderPlatformsMarkup = (game: SeedGame) => {
      if (game.availablePlatformNames.length === 0) {
        return `<span class="product-platform-pill product-platform-tba">TBA Platforms</span>`;
      }
      return game.availablePlatformIds.map((pId, idx) => {
        const name = game.availablePlatformNames[idx] || pId;
        const owned = userOwnedPlatforms.has(pId);
        const ownedClass = owned ? "is-owned" : "is-unowned";
        return `<span class="product-platform-pill ${ownedClass}">${escapeHtml(name)}</span>`;
      }).join(" ");
    };

    const renderTierList = (games: RankedSeedGame[], emptyMessage: string) => {
      if (games.length === 0) {
        return `<p class="product-upcoming-tier-empty">${escapeHtml(emptyMessage)}</p>`;
      }
      return games.map((entry) => {
        const tracked = getCollectionStatus(state.user.gameStates[entry.game.gameId]) === "wishlist";
        const isHighFit = entry.affinityScore >= STRONG_FIT_THRESHOLD && entry.riskScore <= MODERATE_FRICTION_THRESHOLD;
        const isRisky = entry.riskScore >= HIGH_FRICTION_THRESHOLD;

        let rowClass = "";
        if (isHighFit) rowClass = " product-radar-row-highfit";
        else if (isRisky) rowClass = " product-radar-row-risky";

        const dateLabel = entry.game.releaseLabel || entry.game.releaseYear || "TBA";

        return `
          <article class="product-radar-row${rowClass}">
            ${renderCoverArt(entry.game, "thumb")}
            <div class="product-radar-main">
              <div class="product-radar-title-line">
                <h3><button class="product-link-button" data-action="open-dossier" data-game-id="${escapeHtml(entry.game.gameId)}">${escapeHtml(entry.game.title)}</button></h3>
                <span class="product-radar-date">${escapeHtml(dateLabel)}</span>
              </div>
              <p class="product-meta">${escapeHtml(entry.game.series || entry.game.primaryGenre)}</p>
              <div class="product-radar-platforms">
                ${renderPlatformsMarkup(entry.game)}
              </div>
            </div>
            <div class="product-radar-signals">
              <div class="product-chip-list product-chip-list-tight">
                ${tracked ? renderStatusBadge("Watching", "accent") : ""}
                ${renderStatusBadge(formatAccessStatus(entry), accessTone(entry))}
                ${renderStatusBadge(getDecisionLabel(entry), getDecisionTone(entry))}
              </div>
            </div>
            <div class="product-radar-actions">
              ${renderActionButtons(entry.game.gameId, { label: tracked ? "Watching" : "Watch release", action: "track-release" }, [{ label: "Not for me", action: "dismiss-game" }])}
            </div>
          </article>
        `;
      }).join("");
    };

    return `
      <section class="product-page-stack product-upcoming-page">
        <section class="product-radar-head product-page-header">
          <div>
            <p class="product-eyebrow">Radar</p>
            <h2>Games to keep an eye on</h2>
            <p class="product-tagline">These are not for Today yet. Curate future releases aligned with your taste.</p>
          </div>
        </section>

        ${filterContainer}

        <section class="product-panel product-radar-list-surface">

          <div class="product-upcoming-tier-section">
            <div class="product-section-header">
              <div>
                <p class="product-eyebrow">Confirmed releases</p>
                <h2>Confirmed Dates (2026)</h2>
              </div>
            </div>
            <div class="product-radar-list">
              ${renderTierList(confirmed, "No confirmed releases in 2026 match the selected platform filter.")}
            </div>
          </div>

          <div class="product-upcoming-tier-section">
            <div class="product-section-header">
              <div>
                <p class="product-eyebrow">Expected releases</p>
                <h2>Expected in 2026 (Dates TBA)</h2>
              </div>
            </div>
            <div class="product-radar-list">
              ${renderTierList(expectedTba, "No expected 2026 releases match the selected platform filter.")}
            </div>
          </div>

          <div class="product-upcoming-tier-section">
            <div class="product-section-header">
              <div>
                <p class="product-eyebrow">Further out</p>
                <h2>Future & TBA (2027+)</h2>
              </div>
            </div>
            <div class="product-radar-list">
              ${renderTierList(futureOrTba, "No future or TBA releases match the selected platform filter.")}
            </div>
          </div>

        </section>
      </section>
    `;
  }

  function renderFinder() {
    if (!state.user.profile) {
      return createEmptyState(
        "Finish setup first so Finder can check games against what you like.",
        "Open setup",
        "go-setup",
      );
    }

    const finderQuery = ui.finderQuery.trim();
    const exactMatch = finderQuery ? findExactSeedGame(seedData.allGames, finderQuery) : null;
    const hasOnlyNearbyMatches = Boolean(finderQuery && !exactMatch);
    const results = finderQuery
      ? searchSeedGames(seedData.allGames, ui.finderQuery, finderIndex)
      : [...seedData.allGames]
          .filter((game) => game.releaseState === "released")
          .filter((game) => !isBasicCatalogGame(game))
          .filter((game) => !isSavedToMyGames(state.user.gameStates[game.gameId]))
          .map((game) => scoreSeedGame(game, state, state.user.profile!, seedData.gamesById))
          .sort((a, b) => b.affinityScore - a.affinityScore)
          .slice(0, 12)
          .map((r) => r.game);
    const finderEmptyMessage = finderQuery
      ? "No results found. Try a different title or series name."
      : "No new matches outside My Games right now. Search for any title to inspect or update it.";

    return `
      <section class="product-page-stack product-finder-page">
        <div class="product-page-header product-finder-hero">
          <div>
            <p class="product-eyebrow">${finderQuery ? hasOnlyNearbyMatches ? "Closest matches" : "Search results" : "New games to check"}</p>
            <h2>Check a game</h2>
            <p class="product-tagline">${finderQuery
              ? hasOnlyNearbyMatches
                ? "No exact match. Choose a nearby result only if it is the right game."
                : "Showing games ranked against what you like."
              : "Search any game, or browse strong matches that are not in My Games yet."
            }</p>
          </div>
          <label class="product-field">
            <span class="product-field-hint">Search by title, series, or genre</span>
            <input class="product-input" type="search" data-field="finder-query" value="${escapeHtml(ui.finderQuery)}" placeholder="Search a game…">
          </label>
        </div>
        ${hasOnlyNearbyMatches ? `
          <section class="product-exact-warning">
            <strong>No exact match found</strong>
            <p class="product-note">I found nearby matches. Open one only if it is the game you meant.</p>
          </section>
        ` : ""}
        <div class="product-results-list product-results-list-premium">
          ${results.length > 0
            ? results
                .map((game) => {
                  const ranked = scoreSeedGame(game, state, state.user.profile!, seedData.gamesById);
                  return renderGameResultRow(game, ranked, false);
                })
                .join("")
            : createEmptyState(finderEmptyMessage)}
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
      library: "My Games",
      profile: "Profile",
      upcoming: "Upcoming",
    };

    const statusLabel = runtimeMode === "ai-assisted" ? "Assisted" : "Private";
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
            <strong class="app-brand-name">Private game advisor</strong>
          </div>
          <nav class="app-nav" aria-label="Main navigation">
            ${navItems}
          </nav>
          <div class="app-sidebar-footer">
            <span class="app-status-chip${statusCls}">${escapeHtml(statusLabel)}</span>
            ${isOnboarded ? "" : `<p class="app-sidebar-tagline">Decide what deserves your play time.</p>`}
          </div>
        </aside>

        <div class="app-main">
          <header class="app-topbar">
            <div class="app-brand">
              <span class="app-brand-eyebrow">Playfit</span>
              <strong class="app-brand-name">Private game advisor</strong>
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
      ${renderActiveModal()}
    `;

    restoreFocusSnapshot(root, focusSnapshot);
  }

  function isFrictionGuardedAction(action: string | undefined): action is FrictionGuardedAction {
    return action === "set-current-run" || action === "add-backlog" || action === "mark-wishlist";
  }

  async function handleGuardedGameAction(
    action: FrictionGuardedAction,
    gameId: string,
    confirmed = false,
  ) {
    const game = getSeedGame(gameId);

    if (action === "set-current-run") {
      if (!game || game.releaseState !== "released") {
        setStatusMessage("This one is not playable yet.");
        render();
        return;
      }

      if (!confirmed && shouldConfirmFrictionAction(gameId)) {
        openFrictionConfirmation(gameId, action);
        render();
        return;
      }

      updateGameState(gameId, {
        status: "playing",
        ownershipStatus: "owned",
        source: "finder",
      });
      closeModal();
      addFinderAction(gameId, "current_run");
      setStatusMessage("Set as playing. You can keep more than one game in progress.");
      await persistState();
      render();
      return;
    }

    if (action === "add-backlog") {
      if (!game || game.releaseState !== "released") {
        setStatusMessage("This one is not playable yet. Watch it for later instead.");
        render();
        return;
      }

      if (!confirmed && shouldConfirmFrictionAction(gameId)) {
        openFrictionConfirmation(gameId, action);
        render();
        return;
      }

      updateGameState(gameId, {
        collectionStatus: "backlog",
        ownershipStatus: "owned",
        source: "finder",
      });
      closeModal();
      addFinderAction(gameId, "saved");
      setStatusMessage("Added to backlog in My Games.");
      await persistState();
      render();
      return;
    }

    const existing = state.user.gameStates[gameId];
    if (isPlayStatus(existing?.status)) {
      setStatusMessage("Played games stay in My Games, not wishlist.");
      render();
      return;
    }

    if (!confirmed && shouldConfirmFrictionAction(gameId)) {
      openFrictionConfirmation(gameId, action);
      render();
      return;
    }

    updateGameState(gameId, {
      collectionStatus: "wishlist",
      ownershipStatus: "wishlist",
      source: "finder",
    });
    closeModal();
    addFinderAction(gameId, "saved");
    setStatusMessage("Added to wishlist. I will keep it separate from games you are playing.");
    await persistState();
    render();
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
      const profile = buildProfileFromCurrentData();
      state.user.onboarding.draftProfile = profile;
      if (state.user.onboardingCompletedAt && ui.activeTab !== "onboarding") {
        state.user.profile = profile;
      }
      setStatusMessage("Your profile is ready.");
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
      setStatusMessage("Your profile is ready.");
    } catch {
      const profile = buildProfileFromCurrentData();
      state.user.onboarding.draftProfile = profile;
      if (state.user.onboardingCompletedAt && ui.activeTab !== "onboarding") {
        state.user.profile = profile;
      }
      setStatusMessage("Your profile is ready.");
    }

    await persistState();
    render();
  }

  async function finalizeOnboarding() {
    const draftProfile = state.user.onboarding.draftProfile;

    if (!draftProfile) {
      setStatusMessage("Build your profile before continuing.");
      render();
      return;
    }

    state.user.profile = draftProfile;

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
        status: "abandoned",
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

    state.user.onboardingCompletedAt = nowIso();
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
      closeModal();
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

    if (action === "toggle-upcoming-platform") {
      const platformId = button.dataset.platformId;
      if (platformId) {
        if (ui.upcomingPlatformFilters.has(platformId)) {
          ui.upcomingPlatformFilters.delete(platformId);
        } else {
          ui.upcomingPlatformFilters.add(platformId);
        }
        render();
      }
      return;
    }

    if (action === "show-all-upcoming-platforms") {
      seedData.platforms.forEach((p) => ui.upcomingPlatformFilters.add(p.platformId));
      render();
      return;
    }

    if (action === "reset-upcoming-platforms") {
      ui.upcomingPlatformFilters = new Set(
        state.user.onboarding.platforms
          .filter((entry) => ["available", "limited"].includes(entry.status))
          .map((entry) => entry.platformId)
      );
      render();
      return;
    }

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
      if (!(ui.activeTab === "onboarding" && state.user.onboarding.step === "confirm")) {
        const overrides = ensureProfileOverrides();
        overrides.priorities = {
          ...overrides.priorities,
          [key]: value,
        };
        state.user.profile = applyProfileOverrides(profile, overrides);
      }
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
      if (!(ui.activeTab === "onboarding" && state.user.onboarding.step === "confirm")) {
        const overrides = ensureProfileOverrides();
        overrides.avoidPatterns = {
          ...overrides.avoidPatterns,
          [key]: profile.avoidPatterns[key],
        };
        state.user.profile = normalizeProfileSignals(applyProfileOverrides(profile, overrides));
      } else {
        profile.signals = normalizeProfileSignals(profile).signals;
      }
      await persistState();
      render();
      return;
    }

    if (action === "set-watch-risk") {
      const value = button.dataset.profileValue as ProductProfile["watchVsPlayRisk"] | undefined;
      const profile = ui.activeTab === "onboarding" && state.user.onboarding.step === "confirm"
        ? state.user.onboarding.draftProfile
        : state.user.profile;

      if (!profile || !value) return;
      profile.watchVsPlayRisk = value;
      if (!(ui.activeTab === "onboarding" && state.user.onboarding.step === "confirm")) {
        const overrides = ensureProfileOverrides();
        overrides.watchVsPlayRisk = value;
        state.user.profile = applyProfileOverrides(profile, overrides);
      } else {
        profile.signals = normalizeProfileSignals(profile).signals;
      }
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
        ui.profileMode = "overview";
        ui.outcomeNotice = null;
        closeModal();
        setStatusMessage(null);
        render();
        window.scrollTo({ top: 0, behavior: "instant" });
      }
      return;
    }

    if (action === "dismiss-outcome-notice") {
      ui.outcomeNotice = null;
      render();
      return;
    }

    if (action === "close-modal") {
      closeModal();
      render();
      return;
    }

    if (action === "confirm-friction-action") {
      const pending = ui.pendingFrictionAction;
      if (!pending) {
        closeModal();
        render();
        return;
      }
      ui.activeModal = null;
      ui.modalGameId = null;
      ui.pendingFrictionAction = null;
      await handleGuardedGameAction(pending.action, pending.gameId, true);
      return;
    }

    if (gameId && isFrictionGuardedAction(action)) {
      await handleGuardedGameAction(action, gameId);
      return;
    }

    if (action === "open-history-log") {
      ui.historyQuery = "";
      ui.historySelectedGameId = null;
      openModal("history-log");
      render();
      return;
    }

    if (action === "open-profile-edit") {
      ui.profileMode = "edit";
      render();
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }

    if (action === "close-profile-edit") {
      ui.profileMode = "overview";
      render();
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }

    if (action === "open-dossier" && gameId) {
      ui.dossierGameId = gameId;
      ui.dossierReturnTab = ui.activeTab;
      closeModal();
      setStatusMessage(null);
      render();
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }

    if (action === "close-dossier") {
      ui.dossierGameId = null;
      closeModal();
      setStatusMessage(null);
      render();
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }

    if (action === "next-step") {
      if (!canAdvanceOnboarding(state.user.onboarding)) {
        setStatusMessage("Finish this step first.");
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
      openModal("recalibrate");
      render();
      return;
    }

    if (action === "confirm-recalibrate-profile") {
      closeModal();
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
      ui.finderSelectedGameId = null;
      ui.dossierGameId = gameId;
      ui.dossierReturnTab = "finder";
      render();
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }

    if (gameId && action === "open-completion-picker") {
      const game = getSeedGame(gameId);

      if (!game || game.releaseState !== "released") {
        setStatusMessage("This one is not out yet, so it cannot be completed.");
        render();
        return;
      }

      openModal("completion", gameId);
      render();
      return;
    }

    if (action === "close-completion-picker") {
      closeModal();
      render();
      return;
    }

    if (gameId && action === "open-drop-picker") {
      const game = getSeedGame(gameId);

      if (!game || game.releaseState !== "released") {
        setStatusMessage("This one is not out yet, so it cannot be abandoned.");
        render();
        return;
      }

      openModal("drop", gameId);
      render();
      return;
    }

    if (action === "close-drop-picker") {
      closeModal();
      render();
      return;
    }

    if (gameId && action === "complete-game") {
      const game = getSeedGame(gameId);
      const sentiment = button.dataset.sentiment as ProductGameSentiment | undefined;

      if (!game || game.releaseState !== "released" || !sentiment) {
        setStatusMessage("I cannot mark this as completed right now.");
        render();
        return;
      }

      updateGameState(gameId, {
        status: "completed",
        sentiment,
        ownershipStatus: "owned",
      });
      showOutcomeNotice(game, "completed", sentiment);
      await persistState();
      render();
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }

    if (gameId && action === "confirm-drop-run") {
      const game = getSeedGame(gameId);

      if (!game || game.releaseState !== "released") {
        setStatusMessage("I cannot mark this as abandoned right now.");
        render();
        return;
      }

      updateGameState(gameId, {
        status: "abandoned",
        sentiment: "disliked",
        ownershipStatus: "owned",
      });
      addFinderAction(gameId, "abandoned");
      showOutcomeNotice(game, "abandoned", "disliked");
      await persistState();
      render();
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }

    if (gameId && action === "mark-beaten") {
      const game = getSeedGame(gameId);
      if (!game || game.releaseState !== "released") {
        setStatusMessage("I cannot mark this as beaten right now.");
        render();
        return;
      }

      updateGameState(gameId, {
        status: "beaten",
        sentiment: "liked",
        ownershipStatus: "owned",
        source: "finder",
      });
      showOutcomeNotice(game, "beaten", "liked");
      await persistState();
      render();
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }

    if (gameId && action === "retry-dropped-run") {
      const game = getSeedGame(gameId);

      if (!game || game.releaseState !== "released") {
        setStatusMessage("I cannot retry this game right now.");
        render();
        return;
      }

      updateGameState(gameId, {
        status: "playing",
        ownershipStatus: "owned",
        source: "finder",
      });
      closeModal();
      addFinderAction(gameId, "current_run");
      setStatusMessage("Back in progress.");
      await persistState();
      render();
      return;
    }

    if (gameId && action === "mark-interested") {
      await handleGuardedGameAction("add-backlog", gameId);
      return;
    }

    if (gameId && action === "remove-backlog") {
      const existing = state.user.gameStates[gameId];
      updateGameState(gameId, {
        status: existing?.status === "backlog" || existing?.status === "interested" ? null : undefined,
        collectionStatus: null,
        source: "manual",
      });
      closeModal();
      setStatusMessage("Removed from backlog.");
      await persistState();
      render();
      return;
    }

    if (gameId && action === "remove-wishlist") {
      updateGameState(gameId, {
        collectionStatus: null,
        ownershipStatus: "unknown",
        source: "manual",
      });
      closeModal();
      setStatusMessage("Removed from wishlist.");
      await persistState();
      render();
      return;
    }

    if (gameId && action === "track-release") {
      await handleGuardedGameAction("mark-wishlist", gameId);
      return;
    }

    if (gameId && action === "shelve-game") {
      const game = getSeedGame(gameId);
      if (!game || game.releaseState !== "released") {
        setStatusMessage("I cannot shelve this game right now.");
        render();
        return;
      }

      updateGameState(gameId, {
        status: "shelved",
        ownershipStatus: "owned",
        source: "finder",
      });
      closeModal();
      setStatusMessage("Shelved for later.");
      await persistState();
      render();
      return;
    }

    if (gameId && action === "dismiss-game") {
      updateGameState(gameId, {
        status: "dismissed",
        source: "finder",
      });
      closeModal();
      addFinderAction(gameId, "dismissed");
      setStatusMessage("Marked not for me. It will stay out of future picks.");
      await persistState();
      render();
      return;
    }

    if (gameId && action === "rate-game") {
      const rating = Number(button.dataset.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return;
      }

      updateGameState(gameId, {
        rating,
        source: "manual",
      });
      setStatusMessage(`Rated ${rating} star${rating === 1 ? "" : "s"}.`);
      await persistState();
      render();
      return;
    }

    if (gameId && action === "clear-rating") {
      const existing = state.user.gameStates[gameId];
      if (existing) {
        state.user.gameStates[gameId] = {
          ...existing,
          rating: undefined,
          updatedAt: new Date().toISOString(),
        };
      }

      setStatusMessage("Rating cleared.");
      await persistState();
      render();
      return;
    }

    if (gameId && action === "remove-library-game") {
      const game = getSeedGame(gameId);
      delete state.user.gameStates[gameId];
      delete state.user.finderActions[gameId];
      closeModal();
      setStatusMessage(`${game?.title ?? "Game"} removed from My Games.`);
      await persistState();
      render();
      return;
    }

    if (gameId && action === "pause-run") {
      updateGameState(gameId, {
        status: "shelved",
        source: "manual",
      });
      closeModal();
      setStatusMessage("Shelved. You can pick it back up anytime from Today.");
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
      const status = button.dataset.status as "beaten" | "completed" | "dropped" | "abandoned" | undefined;
      if (!sentiment || !status) return;
      updateGameState(gameId, {
        status,
        sentiment,
        ownershipStatus: "owned",
        source: "manual",
      });
      ui.historySelectedGameId = null;
      ui.historyQuery = "";
      closeModal();
      const game = seedData.gamesById.get(gameId);
      const label = status === "abandoned" || status === "dropped"
        ? "abandoned"
        : status === "beaten"
          ? "finished story"
          : sentiment === "liked"
            ? "completed 100%"
            : sentiment === "disliked"
              ? "not your thing"
              : "mixed";
      setStatusMessage(`${game?.title ?? "Game"} saved as ${label}. Future picks just got sharper.`);
      await persistState();
      render();
      return;
    }

    if (gameId && action === "library-reopen") {
      openModal("library-edit", gameId);
      render();
      return;
    }

    if (action === "library-close-edit") {
      closeModal();
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
      ui.profileMode = "overview";
      closeModal();
      setStatusMessage("Starting fresh.");
      render();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !ui.activeModal) {
      return;
    }

    closeModal();
    render();
  });

  refreshAdaptiveProfile();
  render();
}
