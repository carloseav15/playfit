import {
  HIGH_FRICTION_THRESHOLD,
  PROMISING_FIT_THRESHOLD,
  STRONG_FIT_THRESHOLD,
} from "../domain/recommendations";
import type {
  ProductConfidence,
  ProductPlayStatus,
  ProductState,
  RankedSeedGame,
  SeedGame,
} from "../types";

export interface FocusSnapshot {
  selector: string;
  selectionStart: number | null;
  selectionEnd: number | null;
}

export type StatusTone = "positive" | "negative" | "warning" | "neutral" | "accent";

export type ProductCardAction = {
  label: string;
  action: string;
};

export type RankedGameCardOptions = {
  emphasis?: "hero" | "card";
  primaryAction?: ProductCardAction;
  secondaryActions?: ProductCardAction[];
  extraContent?: string;
};

export function cloneState(state: ProductState): ProductState {
  return JSON.parse(JSON.stringify(state)) as ProductState;
}

export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function nowIso() {
  return new Date().toISOString();
}

export function buildFocusSelector(element: Element) {
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

export function captureFocusSnapshot(root: HTMLElement): FocusSnapshot | null {
  const activeElement = document.activeElement;

  if (
    !(activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)
  ) {
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

export function restoreFocusSnapshot(root: HTMLElement, snapshot: FocusSnapshot | null) {
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

export function formatConfidence(value: ProductConfidence) {
  switch (value) {
    case "high":
      return "Strong signal";
    case "medium":
      return "Good signal";
    default:
      return "Early signal";
  }
}

export const MODERATE_FRICTION_THRESHOLD = 35;
export const WEAK_FIT_THRESHOLD = 45;

export function formatAccessStatus(entry: RankedSeedGame) {
  switch (entry.accessStatus) {
    case "playable":
      return "Playable for you";
    case "not_on_platforms":
      return "Not on your platforms";
    case "unreleased":
      return "Not playable yet";
    default:
      return "Check platform";
  }
}

export function accessTone(entry: RankedSeedGame): StatusTone {
  if (entry.accessStatus === "playable") return "positive";
  if (entry.accessStatus === "not_on_platforms") return "negative";
  return "warning";
}

export function formatReleaseState(value: RankedSeedGame["game"]["releaseState"]) {
  return value === "unreleased" ? "Unreleased" : "Released";
}

export function isBasicCatalogGame(game: SeedGame) {
  return game.scoringStatus === "basic";
}

export function formatPlayStatus(value: ProductPlayStatus | undefined) {
  switch (value) {
    case "playing":
      return "Playing";
    case "on_hold":
      return "On hold";
    case "shelved":
      return "Shelved";
    case "beaten":
      return "Finished story";
    case "completed":
      return "Completed 100%";
    case "abandoned":
      return "Abandoned";
    default:
      return "";
  }
}

export function playStatusTone(value: ProductPlayStatus | undefined): StatusTone {
  switch (value) {
    case "playing":
      return "accent";
    case "beaten":
    case "completed":
      return "positive";
    case "abandoned":
      return "negative";
    case "on_hold":
    case "shelved":
      return "warning";
    default:
      return "neutral";
  }
}

export function summarizeRankedGame(entry: RankedSeedGame) {
  if (isBasicCatalogGame(entry.game)) {
    return "Save it and I'll learn as you go.";
  }

  if (
    entry.affinityScore >= STRONG_FIT_THRESHOLD &&
    entry.riskScore <= MODERATE_FRICTION_THRESHOLD
  ) {
    return "This looks like your next obsession.";
  }

  if (entry.riskScore >= HIGH_FRICTION_THRESHOLD) {
    return "Not every acclaimed game is your game — this one might not click.";
  }

  if (entry.affinityScore >= PROMISING_FIT_THRESHOLD) {
    return "Worth a shot — try the first hour and see how it feels.";
  }

  return "Not enough signals yet — save it and picks will get sharper.";
}

export function createEmptyState(message: string, actionLabel?: string, action?: string) {
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

export function getOnboardingGateMessage(state: ProductState) {
  const draft = state.user.onboarding;

  if (draft.step === "platforms") {
    return draft.platforms.length > 0
      ? "Looking good — ready for the next step."
      : "Pick at least one platform to continue.";
  }

  if (draft.step === "anchors") {
    const likedLeft = Math.max(0, 3 - draft.likedGameIds.length);
    if (likedLeft === 0) {
      return "You're ready. Let's find your next game.";
    }
    return `Add ${likedLeft} more game${likedLeft === 1 ? "" : "s"} you loved.`;
  }

  return "";
}

export function affinityLabel(score: number, confidence?: ProductConfidence): string {
  if (score >= STRONG_FIT_THRESHOLD)
    return confidence === "low" ? "Worth a look" : "Looks right for you";
  if (score >= PROMISING_FIT_THRESHOLD) return "Worth a look";
  if (score >= WEAK_FIT_THRESHOLD) return "Getting there";
  return "Weak match";
}

export function frictionLabel(score: number): string {
  if (score >= HIGH_FRICTION_THRESHOLD) return "High friction";
  if (score >= MODERATE_FRICTION_THRESHOLD) return "Possible friction";
  return "Low friction";
}

export function getCoverInitials(game: SeedGame) {
  const words = game.title.split(" ").filter((word) => word && !/^\d/.test(word));
  return (words.length > 0 ? words : game.title.split(" ").filter(Boolean))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}
