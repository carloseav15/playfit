import type { SaveStateFailureReason } from "@playfit/core/store";
import type { ProductState } from "@playfit/core/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductUiState } from "./playfit-context-types";
import type { AuthUser } from "./use-playfit-auth";
import { describeSaveFailure, useQueuedProfileSave } from "./use-queued-profile-save";

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

function state(): ProductState {
  return {
    version: 2,
    stateVersion: "5",
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

function renderQueuedSave() {
  return renderHook(() => {
    const [ui, setUi] = useState<ProductUiState | null>(initialUi());
    const [authUser, setAuthUser] = useState<AuthUser | null>({
      id: "user-1",
      email: "a@b.com",
      isAnonymous: false,
    });
    const [useLocalProfile, setUseLocalProfile] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const save = useQueuedProfileSave({
      setAuthUser,
      setUseLocalProfile,
      setUi,
      setIsSaving,
    });
    return { ...save, ui, authUser, useLocalProfile, isSaving };
  });
}

describe("describeSaveFailure", () => {
  it("uses connectivity language only for network_error", () => {
    const reasons: SaveStateFailureReason[] = [
      "network_error",
      "auth_expired",
      "conflict",
      "rate_limited",
      "server_error",
      "invalid_state",
    ];

    const connectivityPhrases = ["connection", "back online", "offline"];
    for (const reason of reasons) {
      const message = describeSaveFailure({ ok: false, reason, error: "x" });
      const mentionsConnectivity = connectivityPhrases.some((phrase) =>
        message.toLowerCase().includes(phrase),
      );
      if (reason === "network_error") {
        expect(mentionsConnectivity).toBe(true);
      } else {
        expect(mentionsConnectivity).toBe(false);
      }
    }
  });

  it("never claims an automatic retry-when-online mechanism, for any reason", () => {
    const reasons: SaveStateFailureReason[] = [
      "network_error",
      "auth_expired",
      "conflict",
      "rate_limited",
      "server_error",
      "invalid_state",
    ];

    for (const reason of reasons) {
      const message = describeSaveFailure({ ok: false, reason, error: "x" });
      expect(message.toLowerCase()).not.toContain("we'll retry");
    }
  });

  it.each([
    ["network_error", "Couldn't save. Check your connection and try again."],
    ["auth_expired", "Your session expired. Sign in again to save changes."],
    ["rate_limited", "Too many changes at once. Try again in a moment."],
    ["invalid_state", "PlayFit couldn't save this change."],
    ["server_error", "PlayFit couldn't save this right now. Please try again."],
  ] as const)("renders the exact intended copy for %s", (reason, expected) => {
    expect(describeSaveFailure({ ok: false, reason, error: "x" })).toBe(expected);
  });
});

describe("useQueuedProfileSave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the honest message and preserves the reason for each failure category", async () => {
    for (const reason of ["conflict", "rate_limited", "server_error", "invalid_state"] as const) {
      mocks.saveProductState.mockResolvedValueOnce({ ok: false, reason, error: "x" });
      const { result } = renderQueuedSave();

      await act(async () => {
        await result.current.saveNow(state());
      });

      expect(result.current.ui?.saveStatus).toBe("error");
      expect(result.current.ui?.statusMessage).toBe(
        describeSaveFailure({ ok: false, reason, error: "x" }),
      );
    }
  });

  it("on auth_expired: clears the auth user AND shows the session-expired message (previously silent)", async () => {
    mocks.saveProductState.mockResolvedValueOnce({ ok: false, reason: "auth_expired", error: "x" });
    const { result } = renderQueuedSave();

    await act(async () => {
      await result.current.saveNow(state());
    });

    expect(result.current.authUser).toBeNull();
    expect(result.current.ui?.saveStatus).toBe("error");
    expect(result.current.ui?.statusMessage).toBe(
      "Your session expired. Sign in again to save changes.",
    );
  });

  it("on network_error: shows connectivity-specific copy, distinct from server-side reasons", async () => {
    mocks.saveProductState.mockResolvedValueOnce({ ok: false, reason: "network_error", error: "x" });
    const { result } = renderQueuedSave();

    await act(async () => {
      await result.current.saveNow(state());
    });

    expect(result.current.ui?.statusMessage).toBe(
      "Couldn't save. Check your connection and try again.",
    );
  });

  it("on success: sets saved status and does not touch the failure message path", async () => {
    mocks.saveProductState.mockResolvedValueOnce({ ok: true, stateVersion: "6" });
    const { result } = renderQueuedSave();

    await act(async () => {
      await result.current.saveNow(state(), { successMessage: "Added to Playfit Picks." });
    });

    expect(result.current.ui?.saveStatus).toBe("saved");
    expect(result.current.ui?.statusMessage).toBe("Added to Playfit Picks.");
  });

  it("debounced enqueueSave eventually calls saveProductState once and reports success", async () => {
    vi.useFakeTimers();
    mocks.saveProductState.mockResolvedValueOnce({ ok: true, stateVersion: "6" });
    const { result } = renderQueuedSave();

    act(() => {
      result.current.enqueueSave(state());
    });
    expect(result.current.ui?.saveStatus).toBe("saving");

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    vi.useRealTimers();

    await waitFor(() => expect(result.current.ui?.saveStatus).toBe("saved"));
    expect(mocks.saveProductState).toHaveBeenCalledTimes(1);
  });
});
