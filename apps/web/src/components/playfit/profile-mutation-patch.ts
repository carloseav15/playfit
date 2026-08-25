import type { ProductGameState, ProductState, ProductUserState } from "@playfit/core/types";

// The unit of work queued for a profile save. Deliberately NOT a function to be re-executed --
// see the comment on diffUserPatch below for why. Every field here is an already-decided
// absolute value: "gameId X's state is now exactly this object" (or "delete gameId X"), never
// "flip gameId X's current flag." Applying the same patch any number of times, in any order
// relative to other patches, converges to the same result -- it can never double-apply,
// because there is no relative logic left to re-run.
export interface ProfileMutationPatch {
  // null means "delete this game's local state." Absent keys are untouched.
  gameStates?: Record<string, ProductGameState | null>;
  onboarding?: ProductUserState["onboarding"];
  onboardingCompletedAt?: string | null;
  profile?: ProductUserState["profile"];
  // Escape hatch for a full user replacement (account reset, boot-time repair) -- applied
  // before the field-level patches above, so the two mechanisms compose if ever combined.
  replaceUser?: ProductUserState;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

// updateState already computes `next` synchronously, once, for the optimistic UI update --
// that single application is correct by construction, whatever the updater's own logic does
// (toggle, relative computation, absolute set, whatever). The bug this fixes is replaying
// that *logic* a second time at send time against state that already reflects the first
// application: a toggle reads the now-already-flipped value and flips it back. Diffing
// `next` against `current` here captures only the *decided result* -- a plain value -- so
// replay at send time is a value assignment, never a re-run of the updater's logic.
export function diffUserPatch(current: ProductState, next: ProductState): ProfileMutationPatch {
  const patch: ProfileMutationPatch = {};

  const gameIds = new Set([
    ...Object.keys(current.user.gameStates),
    ...Object.keys(next.user.gameStates),
  ]);
  let gameStatesPatch: Record<string, ProductGameState | null> | undefined;
  for (const gameId of gameIds) {
    const before = current.user.gameStates[gameId];
    const after = next.user.gameStates[gameId];
    if (stableJson(before) !== stableJson(after)) {
      gameStatesPatch ??= {};
      gameStatesPatch[gameId] = after ?? null;
    }
  }
  if (gameStatesPatch) patch.gameStates = gameStatesPatch;

  if (stableJson(current.user.onboarding) !== stableJson(next.user.onboarding)) {
    patch.onboarding = next.user.onboarding;
  }
  if (current.user.onboardingCompletedAt !== next.user.onboardingCompletedAt) {
    patch.onboardingCompletedAt = next.user.onboardingCompletedAt;
  }
  if (stableJson(current.user.profile) !== stableJson(next.user.profile)) {
    patch.profile = next.user.profile;
  }

  return patch;
}

export function applyProfileMutationPatch(draft: ProductState, patch: ProfileMutationPatch) {
  if (patch.replaceUser) {
    draft.user = structuredClone(patch.replaceUser);
  }
  if (patch.gameStates) {
    for (const [gameId, value] of Object.entries(patch.gameStates)) {
      if (value === null) delete draft.user.gameStates[gameId];
      else draft.user.gameStates[gameId] = value;
    }
  }
  if (patch.onboarding) {
    draft.user.onboarding = patch.onboarding;
  }
  if ("onboardingCompletedAt" in patch) {
    draft.user.onboardingCompletedAt = patch.onboardingCompletedAt ?? null;
  }
  if ("profile" in patch) {
    draft.user.profile = patch.profile ?? null;
  }
}
