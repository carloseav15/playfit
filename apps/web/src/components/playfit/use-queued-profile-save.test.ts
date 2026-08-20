import type { ProductGameState, ProductState } from "@playfit/core/types";
import { act, renderHook } from "@testing-library/react";
import { useCallback, useRef, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { diffUserPatch } from "./profile-mutation-patch";
import type { ProductUiState } from "./playfit-context-types";
import type { AuthUser } from "./use-playfit-auth";
import {
  describeSaveFailure,
  type ProfileMutationPatch,
  useQueuedProfileSave,
} from "./use-queued-profile-save";

const mocks = vi.hoisted(() => ({
  saveProductState: vi.fn(),
}));

vi.mock("@playfit/core/store", () => ({
  saveProductState: mocks.saveProductState,
}));

function initialUi(): ProductUiState {
  return {
    activeTab: "today",
    onboardingQuery: "",
    statusMessage: null,
    saveStatus: "idle",
    onboardingCompletionPhase: "idle",
    undoAction: null,
  };
}

function baseState(stateVersion: string): ProductState {
  return {
    version: 2,
    stateVersion,
    user: {
      onboarding: {
        step: "dislikes",
        platforms: [],
        likedGameIds: [],
        dislikedGameIds: [],
      },
      onboardingCompletedAt: "2026-08-18T00:00:00.000Z",
      profile: null,
      gameStates: {},
      lastUpdatedAt: null,
    },
  };
}

// Mirrors the *actual* toggleFlag logic in use-playfit-game-actions.ts: reads the flag's
// current value off the draft and flips it. This is exactly the shape of updater that broke
// under raw closure-replay -- the fix must be proven against real relative logic, not just an
// absolute set like SetPick.
function toggleInBacklog(gameId: string) {
  return (draft: ProductState) => {
    const existing: ProductGameState = draft.user.gameStates[gameId] ?? {
      gameId,
      title: gameId,
      inBacklog: false,
      inWishlist: false,
      inPlayfitPicks: false,
      source: "manual",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    };
    draft.user.gameStates[gameId] = {
      ...existing,
      inBacklog: !existing.inBacklog,
      updatedAt: "2026-08-20T00:00:01.000Z",
    };
  };
}

function setPickPatch(gameId: string, picked: boolean): ProfileMutationPatch {
  return {
    gameStates: {
      [gameId]: {
        gameId,
        title: gameId,
        inBacklog: false,
        inWishlist: false,
        inPlayfitPicks: picked,
        source: "manual",
        createdAt: "2026-08-20T00:00:00.000Z",
        updatedAt: "2026-08-20T00:00:00.000Z",
      },
    },
  };
}

function okResponse(stateVersion: string) {
  return Promise.resolve({ ok: true as const, stateVersion });
}

function conflictResponse(status = 409) {
  return Promise.resolve({
    ok: false as const,
    reason: "conflict" as const,
    status,
    error: "Profile changed before this save completed",
  });
}

// Mirrors playfit-context.tsx's real pattern: a ref, not a useState closure, so a long-lived
// debounce-timer callback created in an earlier render still reads whatever is authoritative
// *now*. Also exposes simulateUpdateState, which reproduces updateState's exact real sequence:
// compute `next`, diff it against `current` for the patch, apply `next` optimistically to the
// ref immediately, *then* enqueue the patch -- so getCurrentState() at send time genuinely
// already reflects the mutation, exactly as the concern under test describes.
function renderQueuedSave(initial: ProductState) {
  return renderHook(() => {
    const currentRef = useRef<ProductState | null>(initial);
    const [, forceRender] = useState(0);
    const [ui, setUi] = useState<ProductUiState | null>(initialUi());
    const [authUser, setAuthUser] = useState<AuthUser | null>({
      id: "user-1",
      email: "a@b.com",
      isAnonymous: false,
    });
    const [useLocalProfile, setUseLocalProfile] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const setCurrent = useCallback(
      (updater: ProductState | null | ((c: ProductState | null) => ProductState | null)) => {
        currentRef.current =
          typeof updater === "function"
            ? (updater as (c: ProductState | null) => ProductState | null)(currentRef.current)
            : updater;
        forceRender((n) => n + 1);
      },
      [],
    );

    const save = useQueuedProfileSave({
      getCurrentState: () => currentRef.current,
      setAuthUser,
      setUseLocalProfile,
      setUi,
      setIsSaving,
      onSavedStateVersion: (stateVersion) =>
        setCurrent((c) => (c ? { ...c, stateVersion } : c)),
    });

    const simulateUpdateState = useCallback(
      (updater: (draft: ProductState) => void, options?: { successMessage?: string }) => {
        const current = currentRef.current;
        if (!current) return;
        const next = structuredClone(current);
        updater(next);
        const patch = diffUserPatch(current, next);
        setCurrent(next);
        save.enqueueSave(patch, options);
      },
      [save],
    );

    return { ...save, simulateUpdateState, ui, authUser, current: currentRef.current, setCurrent };
  });
}

describe("describeSaveFailure", () => {
  it("uses connectivity language only for network_error", () => {
    const reasons = [
      "network_error",
      "auth_expired",
      "conflict",
      "rate_limited",
      "server_error",
      "invalid_state",
    ] as const;

    const connectivityPhrases = ["connection", "back online", "offline"];
    for (const reason of reasons) {
      const message = describeSaveFailure({ ok: false, reason, error: "x" });
      const mentionsConnectivity = connectivityPhrases.some((phrase) =>
        message.toLowerCase().includes(phrase),
      );
      expect(mentionsConnectivity).toBe(reason === "network_error");
    }
  });

  it("never claims an automatic retry-when-online mechanism, for any reason", () => {
    const reasons = [
      "network_error",
      "auth_expired",
      "conflict",
      "rate_limited",
      "server_error",
      "invalid_state",
    ] as const;

    for (const reason of reasons) {
      const message = describeSaveFailure({ ok: false, reason, error: "x" });
      expect(message.toLowerCase()).not.toContain("we'll retry");
    }
  });
});

describe("useQueuedProfileSave: replay safety of the diffed patch design", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });

  it("1) optimistic SetPick followed by send does not double-apply", async () => {
    mocks.saveProductState.mockImplementation((state: ProductState) =>
      okResponse(state.stateVersion),
    );
    const { result } = renderQueuedSave(baseState("7"));

    act(() => {
      result.current.simulateUpdateState((draft) => {
        draft.user.gameStates.pick_game = {
          gameId: "pick_game",
          title: "pick_game",
          inBacklog: false,
          inWishlist: false,
          inPlayfitPicks: true,
          source: "manual",
          createdAt: "2026-08-20T00:00:00.000Z",
          updatedAt: "2026-08-20T00:00:00.000Z",
        };
      });
    });
    // Optimistic apply already happened -- getCurrentState() now reflects the pick, exactly
    // the precondition the concern describes.
    expect(result.current.current?.user.gameStates.pick_game?.inPlayfitPicks).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    const sent = mocks.saveProductState.mock.calls[0][0] as ProductState;
    expect(sent.user.gameStates.pick_game).toMatchObject({ inPlayfitPicks: true });
  });

  it("2) a relative TOGGLE updater (the actual toggleFlag shape) does not flip back on replay", async () => {
    mocks.saveProductState.mockImplementation((state: ProductState) =>
      okResponse(state.stateVersion),
    );
    const { result } = renderQueuedSave(baseState("7"));

    // Click "add to backlog": false -> true, applied optimistically exactly like updateState.
    act(() => {
      result.current.simulateUpdateState(toggleInBacklog("g1"));
    });
    expect(result.current.current?.user.gameStates.g1?.inBacklog).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    // If the raw updater had been replayed against the already-true state (the bug this fix
    // corrects), this would read false. The patch-based design sends the decided value once.
    const sent = mocks.saveProductState.mock.calls[0][0] as ProductState;
    expect(sent.user.gameStates.g1?.inBacklog).toBe(true);
  });

  it("multiple rapid toggles in one debounce window converge to the correct final value", async () => {
    mocks.saveProductState.mockImplementation((state: ProductState) =>
      okResponse(state.stateVersion),
    );
    const { result } = renderQueuedSave(baseState("7"));

    // Three clicks: off -> on -> off -> on. Final intent is "on".
    act(() => result.current.simulateUpdateState(toggleInBacklog("g1")));
    act(() => result.current.simulateUpdateState(toggleInBacklog("g1")));
    act(() => result.current.simulateUpdateState(toggleInBacklog("g1")));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(mocks.saveProductState).toHaveBeenCalledTimes(1);
    const sent = mocks.saveProductState.mock.calls[0][0] as ProductState;
    expect(sent.user.gameStates.g1?.inBacklog).toBe(true);
  });

  it("3) a failed save does not discard the queued mutation -- it survives in authoritative state for the next attempt", async () => {
    mocks.saveProductState.mockReturnValueOnce(conflictResponse());
    const { result } = renderQueuedSave(baseState("7"));

    act(() => {
      result.current.simulateUpdateState(toggleInBacklog("g1"));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.ui?.saveStatus).toBe("error");

    // The mutation was never rolled back locally -- it's still present in authoritative state,
    // so retrying (an empty patch, mirroring retrySave) still submits it.
    expect(result.current.current?.user.gameStates.g1?.inBacklog).toBe(true);

    mocks.saveProductState.mockImplementationOnce((state: ProductState) =>
      okResponse(state.stateVersion),
    );
    act(() => {
      result.current.enqueueSave({});
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    const retried = mocks.saveProductState.mock.calls[1][0] as ProductState;
    expect(retried.user.gameStates.g1?.inBacklog).toBe(true);
    expect(result.current.ui?.saveStatus).toBe("saved");
  });

  it("4)+5) B enqueued while A is in flight survives, is not lost, and saves against A's returned version", async () => {
    let resolveA: (value: { ok: true; stateVersion: string }) => void;
    const aPromise = new Promise<{ ok: true; stateVersion: string }>((resolve) => {
      resolveA = resolve;
    });
    mocks.saveProductState
      .mockImplementationOnce(() => aPromise)
      .mockImplementationOnce((state: ProductState) => okResponse(state.stateVersion));

    const { result } = renderQueuedSave(baseState("7"));

    // A: mirrors the real updateState -> flushSave path (e.g. applyDecisionFeedback's local
    // branch flushing before a canonical call) -- optimistic apply to authoritative state
    // first, exactly like every real call site that ends up calling saveNow/flushSave, then
    // flush immediately so it's genuinely in flight. doSave's actual saveProductState call
    // happens inside a promise chained onto saveQueueRef.current, so a microtask tick is
    // needed before it's actually invoked.
    let aTask!: Promise<unknown>;
    await act(async () => {
      result.current.simulateUpdateState(setPickPatchUpdater("game_a", true));
      aTask = result.current.flushSave();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.saveProductState).toHaveBeenCalledTimes(1);

    // B is enqueued while A is still unresolved.
    act(() => {
      result.current.simulateUpdateState(toggleInBacklog("game_b"));
    });

    // Resolve A with the authoritative version advancing to 8.
    await act(async () => {
      resolveA({ ok: true, stateVersion: "8" });
      await aTask;
    });
    expect(result.current.current?.stateVersion).toBe("8");
    // B has not been sent yet -- still waiting on its own debounce.
    expect(mocks.saveProductState).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(mocks.saveProductState).toHaveBeenCalledTimes(2);
    const sentB = mocks.saveProductState.mock.calls[1][0] as ProductState;
    expect(sentB.stateVersion).toBe("8");
    // B is not lost, and A's own write is not replayed a second time as part of B's send --
    // A's data is present because it's already part of authoritative state after A succeeded,
    // not because B's patch re-applied it.
    expect(sentB.user.gameStates.game_a).toMatchObject({ inPlayfitPicks: true });
    expect(sentB.user.gameStates.game_b?.inBacklog).toBe(true);
  });

  it("6) A fails while B exists: B is not lost, dropped, or duplicated, and carries A's edit forward", async () => {
    mocks.saveProductState
      .mockImplementationOnce(() => conflictResponse())
      .mockImplementationOnce((state: ProductState) => okResponse(state.stateVersion));

    const { result } = renderQueuedSave(baseState("7"));

    act(() => {
      result.current.simulateUpdateState(setPickPatchUpdater("game_a", true));
    });
    // B queued before A's debounce fires -- both patches are pending together.
    act(() => {
      result.current.simulateUpdateState(toggleInBacklog("game_b"));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(mocks.saveProductState).toHaveBeenCalledTimes(1);
    expect(result.current.ui?.saveStatus).toBe("error");
    // Local edits from the failed attempt were not rolled back.
    expect(result.current.current?.user.gameStates.game_a).toMatchObject({ inPlayfitPicks: true });
    expect(result.current.current?.user.gameStates.game_b?.inBacklog).toBe(true);

    // User continues editing -- a third change.
    act(() => {
      result.current.simulateUpdateState(setPickPatchUpdater("game_c", true));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(mocks.saveProductState).toHaveBeenCalledTimes(2);
    const sent = mocks.saveProductState.mock.calls[1][0] as ProductState;
    // All three edits present exactly once each -- nothing dropped, nothing duplicated.
    expect(sent.user.gameStates.game_a).toMatchObject({ inPlayfitPicks: true });
    expect(sent.user.gameStates.game_b?.inBacklog).toBe(true);
    expect(sent.user.gameStates.game_c).toMatchObject({ inPlayfitPicks: true });
  });

  it("7) same-session canonical interleaving remains protected: rebuilds from post-canonical state and keeps both changes", async () => {
    mocks.saveProductState.mockImplementation((state: ProductState) =>
      okResponse(state.stateVersion),
    );
    const { result } = renderQueuedSave(baseState("7"));

    act(() => {
      result.current.simulateUpdateState(setPickPatchUpdater("pick_game", true));
    });

    // Canonical decision lands mid-debounce: stateVersion 7 -> 8, writes a *different* game.
    act(() => {
      result.current.setCurrent((c) =>
        c
          ? {
              ...c,
              stateVersion: "8",
              user: {
                ...c.user,
                gameStates: {
                  ...c.user.gameStates,
                  loved_game: {
                    gameId: "loved_game",
                    title: "loved_game",
                    status: "completed",
                    rating: 5,
                    inBacklog: false,
                    inWishlist: false,
                    inPlayfitPicks: false,
                    source: "manual",
                    createdAt: "2026-08-20T00:00:00.000Z",
                    updatedAt: "2026-08-20T00:00:05.000Z",
                  },
                },
              },
            }
          : c,
      );
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(mocks.saveProductState).toHaveBeenCalledTimes(1);
    const sent = mocks.saveProductState.mock.calls[0][0] as ProductState;
    expect(sent.stateVersion).toBe("8");
    expect(sent.user.gameStates.loved_game).toMatchObject({ status: "completed", rating: 5 });
    expect(sent.user.gameStates.pick_game).toMatchObject({ inPlayfitPicks: true });
  });

  it("8) true cross-session 409 is not retried, and the existing conflict message is shown", async () => {
    mocks.saveProductState.mockReturnValue(conflictResponse());
    const { result } = renderQueuedSave(baseState("7"));

    act(() => {
      result.current.simulateUpdateState(setPickPatchUpdater("pick_game", true));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(mocks.saveProductState).toHaveBeenCalledTimes(1);
    expect(result.current.ui?.saveStatus).toBe("error");
    expect(result.current.ui?.statusMessage).toBe(
      "Your profile changed in another session. Reload before trying again.",
    );
  });
});

function setPickPatchUpdater(gameId: string, picked: boolean) {
  return (draft: ProductState) => {
    draft.user.gameStates[gameId] = {
      gameId,
      title: gameId,
      inBacklog: false,
      inWishlist: false,
      inPlayfitPicks: picked,
      source: "manual",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    };
  };
}

describe("useQueuedProfileSave: unchanged failure-classification behavior", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("on auth_expired: clears the auth user and shows the session-expired message", async () => {
    mocks.saveProductState.mockResolvedValueOnce({
      ok: false,
      reason: "auth_expired",
      error: "x",
    });
    const { result } = renderQueuedSave(baseState("7"));

    await act(async () => {
      await result.current.saveNow(setPickPatch("pick_game", true));
    });

    expect(result.current.authUser).toBeNull();
    expect(result.current.ui?.statusMessage).toBe(
      "Your session expired. Sign in again to save changes.",
    );
  });

  it("on network_error: shows connectivity-specific copy", async () => {
    mocks.saveProductState.mockResolvedValueOnce({
      ok: false,
      reason: "network_error",
      error: "x",
    });
    const { result } = renderQueuedSave(baseState("7"));

    await act(async () => {
      await result.current.saveNow(setPickPatch("pick_game", true));
    });

    expect(result.current.ui?.statusMessage).toBe(
      "Couldn't save. Check your connection and try again.",
    );
  });

  it("on success: sets saved status with the provided success message", async () => {
    mocks.saveProductState.mockResolvedValueOnce({ ok: true, stateVersion: "8" });
    const { result } = renderQueuedSave(baseState("7"));

    await act(async () => {
      await result.current.saveNow(setPickPatch("pick_game", true), {
        successMessage: "Added to Playfit Picks.",
      });
    });

    expect(result.current.ui?.saveStatus).toBe("saved");
    expect(result.current.ui?.statusMessage).toBe("Added to Playfit Picks.");
  });

  it("returns invalid_state and does not call saveProductState when no authoritative state is available", async () => {
    const { result } = renderQueuedSave(baseState("7"));
    act(() => {
      result.current.setCurrent(null);
    });

    const outcome = await act(async () => result.current.saveNow(setPickPatch("pick_game", true)));

    expect(outcome).toMatchObject({ ok: false, reason: "invalid_state" });
    expect(mocks.saveProductState).not.toHaveBeenCalled();
  });
});
