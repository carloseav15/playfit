import {
  HIGH_FRICTION_THRESHOLD,
  PROMISING_FIT_THRESHOLD,
  STRONG_FIT_THRESHOLD,
} from "../domain/recommendations";
import type {
  ProductPlayStatus,
  ProductProfile,
  ProductRating,
  RankedSeedGame,
  SeedGame,
} from "../types";
import {
  accessTone,
  affinityLabel,
  createEmptyState,
  escapeHtml,
  formatAccessStatus,
  formatConfidence,
  formatReleaseState,
  frictionLabel,
  getCoverInitials,
  isBasicCatalogGame,
  MODERATE_FRICTION_THRESHOLD,
  type ProductCardAction,
  type RankedGameCardOptions,
  type StatusTone,
  summarizeRankedGame,
} from "./helpers";

type ProductTab = "onboarding" | "today" | "finder" | "library" | "profile" | "upcoming";

export function renderCoverArt(game: SeedGame, variant: "hero" | "dossier" | "thumb" = "dossier") {
  const fallbackTitle = variant === "thumb" ? "" : `<small>${escapeHtml(game.title)}</small>`;
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

export function getDecisionTone(entry: RankedSeedGame): StatusTone {
  if (isBasicCatalogGame(entry.game)) return "neutral";
  if (entry.riskScore >= HIGH_FRICTION_THRESHOLD) return "negative";
  if (entry.affinityScore >= STRONG_FIT_THRESHOLD && entry.riskScore <= MODERATE_FRICTION_THRESHOLD)
    return "positive";
  if (entry.affinityScore >= PROMISING_FIT_THRESHOLD) return "accent";
  return "warning";
}

export function getDecisionLabel(entry: RankedSeedGame) {
  if (isBasicCatalogGame(entry.game)) return "Save to learn more";
  if (entry.riskScore >= HIGH_FRICTION_THRESHOLD) return "High friction";
  return affinityLabel(entry.affinityScore, entry.confidence);
}

export function getPrimaryReason(entry: RankedSeedGame) {
  if (isBasicCatalogGame(entry.game)) {
    return "Save to learn more";
  }

  if (entry.riskScore >= HIGH_FRICTION_THRESHOLD && entry.cautionReasons.length > 0) {
    return entry.cautionReasons[0];
  }

  if (entry.fitReasons.length > 0) {
    return entry.fitReasons[0];
  }

  return summarizeRankedGame(entry);
}

export function renderStatusBadge(label: string, tone: StatusTone = "neutral", extraClass = "") {
  const suffix = extraClass ? ` ${extraClass}` : "";
  return `<span class="product-status-badge product-status-${tone}${suffix}">${escapeHtml(label)}</span>`;
}

export function renderMetricStrip(entry: RankedSeedGame) {
  if (isBasicCatalogGame(entry.game)) {
    return `
      <div class="product-metric-strip product-metric-strip-basic" aria-label="Catalog status">
        <div class="product-metric">
          <span>Detail</span>
          <strong>Basic</strong>
        </div>
        <div class="product-metric">
          <span>Source</span>
          <strong>Search</strong>
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

export function renderReasonsBlock(
  entry: RankedSeedGame,
  options: { fitTitle?: string; cautionTitle?: string } = {},
) {
  if (isBasicCatalogGame(entry.game)) {
    return `
      <div class="product-reason-grid">
        <div class="product-reason-panel">
          <strong>What I know about it</strong>
          <ul>
            <li>${escapeHtml(entry.game.primaryGenre ? `Genre: ${entry.game.primaryGenre.replaceAll("_", " ")}` : "Basic title metadata is available.")}</li>
            <li>${escapeHtml(entry.game.availablePlatformNames.length > 0 ? `Platforms: ${entry.game.availablePlatformNames.join(", ")}` : "Platform data is incomplete.")}</li>
          </ul>
        </div>
        <div class="product-reason-panel">
          <strong>To get better picks</strong>
          <ul>
            <li>Save to My Games and add ratings — each one helps.</li>
          </ul>
        </div>
      </div>
    `;
  }

  return `
    <div class="product-reason-grid">
      <div class="product-reason-panel">
        <strong>${escapeHtml(options.fitTitle ?? "Why it fits")}</strong>
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

export function renderStars(
  value: ProductRating | undefined,
  gameId: string,
  interactive: boolean,
) {
  if (!interactive) {
    if (value == null || value === 0)
      return `<span class="product-stars product-stars-static"><span class="product-meta">No rating</span></span>`;
    const nodes = [1, 2, 3, 4, 5]
      .map((n) => {
        const filled = value >= n;
        const half = value >= n - 0.5 && value < n;
        const cls = filled ? "is-filled" : half ? "is-half" : "";
        return `<span class="star-icon ${cls}">★</span>`;
      })
      .join("");
    return `<span class="product-stars product-stars-static" title="${value} stars">${nodes}</span>`;
  }
  const stars = [1, 2, 3, 4, 5]
    .map((n) => {
      const filled = value != null && value >= n;
      const half = value != null && value >= n - 0.5 && value < n;
      const btnCls = `star-btn${filled ? " is-active" : ""}${half ? " is-half" : ""}`;
      const iconCls = filled ? "is-filled" : half ? "is-half" : "";
      return `<button type="button" class="${btnCls}" data-action="set-rating" data-game-id="${escapeHtml(gameId)}" data-star="${n}" title="${n} stars"><span class="star-icon ${iconCls}">★</span></button>`;
    })
    .join("");
  return `
    <span class="product-stars product-stars-interactive" data-game-id="${escapeHtml(gameId)}" data-field="star-rating">
      ${stars}
    </span>
  `;
}

export function renderActionButtons(
  gameId: string,
  primaryAction?: ProductCardAction,
  secondaryActions: ProductCardAction[] = [],
) {
  const primary = primaryAction
    ? `<button class="product-button product-button-primary" data-action="${escapeHtml(primaryAction.action)}" data-game-id="${escapeHtml(gameId)}">${escapeHtml(primaryAction.label)}</button>`
    : "";
  const secondary = secondaryActions
    .map(
      (item) =>
        `<button class="product-button product-button-secondary" data-action="${escapeHtml(item.action)}" data-game-id="${escapeHtml(gameId)}">${escapeHtml(item.label)}</button>`,
    )
    .join("");

  return primary || secondary
    ? `<div class="product-state-actions">${primary}${secondary}</div>`
    : "";
}

export function renderGameDossier(
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
            ${isBasicCatalogGame(entry.game) ? renderStatusBadge("Save to learn more", "neutral") : renderStatusBadge(frictionLabel(entry.riskScore), entry.riskScore >= HIGH_FRICTION_THRESHOLD ? "negative" : entry.riskScore >= MODERATE_FRICTION_THRESHOLD ? "warning" : "positive")}
            ${isBasicCatalogGame(entry.game) ? "" : renderStatusBadge(formatConfidence(entry.confidence), entry.confidence === "high" ? "positive" : entry.confidence === "medium" ? "accent" : "warning")}
            ${renderStatusBadge(formatAccessStatus(entry), accessTone(entry))}
            ${entry.inBacklog ? renderStatusBadge("Backlog", "neutral") : ""}
            ${entry.inWishlist ? renderStatusBadge("Wishlist", "accent") : ""}
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

export function renderDecisionHero(
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
          ${entry.inBacklog ? renderStatusBadge("Backlog", "neutral") : ""}
          ${entry.inWishlist ? renderStatusBadge("Wishlist", "accent") : ""}
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

export function renderGameResultRow(game: SeedGame, ranked: RankedSeedGame, isSelected: boolean) {
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
        <span>${ranked.inBacklog ? "Backlog" : ranked.inWishlist ? "Wishlist" : isBasicCatalogGame(game) ? "Catalog only" : "Taste pick"}</span>
        <span>${escapeHtml(isBasicCatalogGame(game) ? "Ready to save" : formatAccessStatus(ranked))}</span>
      </span>
    </button>
  `;
}

export function renderRankedGameCard(
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

export function renderDecisionQueueItem(
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

export const NAV_ICONS: Record<ProductTab, string> = {
  today: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="14" height="13" rx="2"/><path d="M6 1v4M12 1v4M2 8h14"/></svg>`,
  library: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 4h12M3 9h12M3 14h7"/></svg>`,
  finder: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="5"/><path d="M14 14l-2.5-2.5"/></svg>`,
  onboarding: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="9" cy="9" r="3"/><path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.2 3.2l1.4 1.4M13.4 13.4l1.4 1.4M3.2 14.8l1.4-1.4M13.4 4.6l1.4-1.4"/></svg>`,
  profile: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5.5" r="3"/><path d="M3.5 16c.8-3 2.6-4.5 5.5-4.5s4.7 1.5 5.5 4.5"/></svg>`,
  upcoming: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15V4a1 1 0 0 1 1-1h9.5L15 4.5V15"/><path d="M6 7h6M6 10h5M6 13h3"/></svg>`,
};

export const PROFILE_PRIORITY_FIELDS: Array<{
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

export const PROFILE_RISK_FIELDS: Array<{
  key: keyof ProductProfile["avoidPatterns"];
  label: string;
}> = [
  { key: "slowStart", label: "Slow starts" },
  { key: "repetition", label: "Repetition or grind" },
  { key: "confusingSystems", label: "Confusing systems" },
  { key: "weakEmotionalPull", label: "Weak emotional pull" },
  { key: "shallowCombat", label: "Shallow combat" },
];

export function renderProfileEditor(profile: ProductProfile) {
  const watchOptions: Array<ProductProfile["watchVsPlayRisk"]> = ["low", "medium", "high"];

  const allFields: Array<{
    key: keyof ProductProfile["priorities"];
    label: string;
  }> = [...PROFILE_PRIORITY_FIELDS, { key: "combat", label: "Combat" }];

  return `
    <div class="product-profile-editor">
      <section class="product-card">
        <h3>What matters to you</h3>
        <p class="product-note">Toggle what affects your enjoyment most. Picks update right away.</p>
        <div class="product-chip-list">
          ${allFields
            .map(
              (field) => `
            <button
              type="button"
              class="product-pill-button${profile.priorities[field.key] !== "low" ? " is-selected" : ""}"
              data-action="toggle-profile-priority"
              data-profile-key="${escapeHtml(field.key)}"
              aria-pressed="${profile.priorities[field.key] !== "low" ? "true" : "false"}"
            >
              ${escapeHtml(field.label)}
            </button>
          `,
            )
            .join("")}
        </div>
      </section>
      <section class="product-card">
        <h3>What tends to break games for you</h3>
        <div class="product-chip-list">
          ${PROFILE_RISK_FIELDS.map(
            (field) => `
            <button
              type="button"
              class="product-pill-button${profile.avoidPatterns[field.key] ? " is-selected" : ""}"
              data-action="toggle-profile-risk"
              data-risk-key="${escapeHtml(field.key)}"
              aria-pressed="${profile.avoidPatterns[field.key] ? "true" : "false"}"
            >
              ${escapeHtml(field.label)}
            </button>
          `,
          ).join("")}
        </div>
      </section>
      <section class="product-card">
        <h3>Story-heavy vs gameplay-heavy</h3>
        <div class="product-segmented-control">
          ${watchOptions
            .map(
              (value) => `
            <button
              type="button"
              class="product-segmented-option${profile.watchVsPlayRisk === value ? " is-active" : ""}"
              data-action="set-watch-risk"
              data-profile-value="${escapeHtml(value)}"
              aria-pressed="${profile.watchVsPlayRisk === value ? "true" : "false"}"
            >
              ${value === "high" ? "Story first" : value === "low" ? "Gameplay first" : "Balanced"}
            </button>
          `,
            )
            .join("")}
        </div>
      </section>
    </div>
  `;
}

export function renderStatusDropdown(
  gameId: string,
  currentStatus: ProductPlayStatus | undefined,
  isReleased: boolean,
) {
  const statuses: Array<{ value: ProductPlayStatus; label: string }> = [
    { value: "playing", label: "Playing" },
    { value: "on_hold", label: "On hold" },
    { value: "shelved", label: "Shelved" },
    { value: "beaten", label: "Beaten" },
    { value: "completed", label: "Completed" },
    { value: "abandoned", label: "Abandoned" },
  ];
  const options = statuses
    .map((s) => {
      const disabled = !isReleased && s.value !== "abandoned" ? " disabled" : "";
      const selected = s.value === currentStatus ? " selected" : "";
      return `<option value="${s.value}"${selected}${disabled}>${s.label}</option>`;
    })
    .join("");
  return `
    <select class="product-status-select" data-action="set-play-status" data-game-id="${escapeHtml(gameId)}" aria-label="Play status for ${escapeHtml(gameId)}">
      <option value=""${currentStatus ? "" : " selected"}>Set status…</option>
      ${options}
    </select>
  `;
}

export function renderInlineGameActions(
  gameId: string,
  gameState: {
    status?: ProductPlayStatus;
    rating?: ProductRating;
    inBacklog: boolean;
    inWishlist: boolean;
    storyCompleted?: boolean;
  },
  isReleased: boolean,
) {
  return `
    <div class="product-inline-actions">
      <div class="product-inline-section">
        <span class="product-field-hint">Play status</span>
        ${renderStatusDropdown(gameId, gameState.status, isReleased)}
      </div>
      <div class="product-inline-section">
        <span class="product-field-hint">Rating</span>
        ${renderStars(gameState.rating, gameId, true)}
      </div>
      <div class="product-inline-section product-inline-toggles">
        <button type="button" class="product-pill-button${gameState.inBacklog ? " is-selected" : ""}" data-action="toggle-backlog" data-game-id="${escapeHtml(gameId)}">${gameState.inBacklog ? "In backlog" : "Backlog"}</button>
        <button type="button" class="product-pill-button${gameState.inWishlist ? " is-selected" : ""}" data-action="toggle-wishlist" data-game-id="${escapeHtml(gameId)}">${gameState.inWishlist ? "In wishlist" : "Wishlist"}</button>
        ${
          gameState.status === "abandoned" && gameState.rating != null && gameState.rating >= 4
            ? `
          <button type="button" class="product-pill-button${gameState.storyCompleted ? " is-selected" : ""}" data-action="toggle-story-completed" data-game-id="${escapeHtml(gameId)}">${gameState.storyCompleted ? "Story completed ✓" : "Story completed via other means?"}</button>
        `
            : ""
        }
      </div>
    </div>
  `;
}
