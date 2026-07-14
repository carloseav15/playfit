import { act, cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayfitProvider, usePlayfit } from "./playfit-context";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// Mock the core store functions
vi.mock("@playfit/core/store", () => ({
  createInitialState: vi.fn(() => ({
    user: {
      deviceId: "test-device-id",
      onboardingCompletedAt: "2026-07-06T00:00:00Z",
      onboarding: {
        step: "completed",
        likedGameIds: ["game1"],
        dislikedGameIds: [],
        platforms: [],
      },
      gameStates: {},
      profile: null,
    },
  })),
  loadProductState: vi.fn(async () => ({
    user: {
      deviceId: "test-device-id",
      onboardingCompletedAt: "2026-07-06T00:00:00Z",
      onboarding: {
        step: "completed",
        likedGameIds: ["game1"],
        dislikedGameIds: [],
        platforms: [],
      },
      gameStates: {},
      profile: { nintendo: 0.8 },
    },
  })),
  saveProductState: vi.fn(async () => {}),
  resetProductState: vi.fn(),
  setCachedAuth: vi.fn(),
}));

// Mock game-cache
vi.mock("@/lib/game-cache", () => ({
  getCachedGame: vi.fn((id) => ({
    gameId: id,
    title: `Game ${id}`,
    tags: [],
  })),
  addGamesToCache: vi.fn(),
  clearGameCache: vi.fn(),
  ensureGamesCached: vi.fn(async () => {}),
}));

// Mock supabase functions
// Mock supabase functions
const mockSession = {
  user: { id: "test-user-id" },
  access_token: "test-token",
};

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: mockSession }, error: null })),
      signInAnonymously: vi.fn(async () => ({ data: { session: mockSession }, error: null })),
      onAuthStateChange: vi.fn((callback) => {
        callback("SIGNED_IN", mockSession);
        return {
          data: { subscription: { unsubscribe: vi.fn() } },
        };
      }),
      signOut: vi.fn(async () => ({ error: null })),
    },
    rpc: vi.fn(),
  },
}));

// Helper component to consume context and trigger mutations
function TestConsumer() {
  const { state, setPlayfitPick, applyDecisionFeedback, resetTasteProfile, deleteAccount } =
    usePlayfit();
  const [resetOutcome, setResetOutcome] = useState("idle");
  const [deleteOutcome, setDeleteOutcome] = useState("idle");

  if (!state) {
    return <div data-testid="loading">Loading...</div>;
  }

  return (
    <div>
      <div data-testid="completed-at">{state.user.onboardingCompletedAt}</div>
      <div data-testid="game1-pick">
        {state.user.gameStates.game1?.inPlayfitPicks ? "picked" : "not-picked"}
      </div>
      <div data-testid="game2-status">{state.user.gameStates.game2?.status || "none"}</div>
      <div data-testid="platform-count">{state.user.onboarding.platforms.length}</div>
      <div data-testid="reset-outcome">{resetOutcome}</div>
      <div data-testid="delete-outcome">{deleteOutcome}</div>
      <button type="button" onClick={() => setPlayfitPick("game1", true)} data-testid="pick-btn">
        Pick Game 1
      </button>
      <button
        type="button"
        onClick={() => applyDecisionFeedback("game2", "played_loved")}
        data-testid="love-btn"
      >
        Love Game 2
      </button>
      <button
        type="button"
        data-testid="reset-btn"
        onClick={async () => {
          try {
            await resetTasteProfile();
            setResetOutcome("succeeded");
          } catch {
            setResetOutcome("failed");
          }
        }}
      >
        Reset
      </button>
      <button
        type="button"
        data-testid="delete-btn"
        onClick={async () => {
          try {
            await deleteAccount();
            setDeleteOutcome("succeeded");
          } catch {
            setDeleteOutcome("failed");
          }
        }}
      >
        Delete
      </button>
    </div>
  );
}

describe("PlayfitProvider and usePlayfit Context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("boots the state and renders loading initially then data", async () => {
    render(
      <PlayfitProvider platforms={[]} localFirst={true}>
        <TestConsumer />
      </PlayfitProvider>,
    );

    expect(screen.getByLabelText("Loading")).toBeDefined();

    // Wait for the state to boot (loadProductState resolves)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(screen.getByTestId("completed-at").textContent).toBe("2026-07-06T00:00:00Z");
  });

  it("can toggle playfit picks", async () => {
    render(
      <PlayfitProvider platforms={[]} localFirst={true}>
        <TestConsumer />
      </PlayfitProvider>,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(screen.getByTestId("game1-pick").textContent).toBe("not-picked");

    await act(async () => {
      screen.getByTestId("pick-btn").click();
    });

    expect(screen.getByTestId("game1-pick").textContent).toBe("picked");
  });

  it("can apply game decision feedback", async () => {
    render(
      <PlayfitProvider platforms={[]} localFirst={true}>
        <TestConsumer />
      </PlayfitProvider>,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(screen.getByTestId("game2-status").textContent).toBe("none");

    await act(async () => {
      screen.getByTestId("love-btn").click();
    });

    expect(screen.getByTestId("game2-status").textContent).toBe("completed");
  });

  it("keeps local state when resetTasteProfile's cloud delete fails", async () => {
    const { resetProductState, createInitialState } = await import("@playfit/core/store");
    vi.mocked(resetProductState).mockRejectedValueOnce(new Error("server_error"));

    render(
      <PlayfitProvider platforms={[]} localFirst={true}>
        <TestConsumer />
      </PlayfitProvider>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      screen.getByTestId("reset-btn").click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByTestId("reset-outcome").textContent).toBe("failed");
    // Local state (onboardingCompletedAt from the mocked loadProductState) must be untouched.
    expect(screen.getByTestId("completed-at").textContent).toBe("2026-07-06T00:00:00Z");
    expect(createInitialState).not.toHaveBeenCalled();
  });

  it("clears local state when resetTasteProfile's cloud delete succeeds", async () => {
    const { resetProductState, createInitialState } = await import("@playfit/core/store");
    vi.mocked(resetProductState).mockResolvedValueOnce(undefined);

    render(
      <PlayfitProvider platforms={[]} localFirst={true}>
        <TestConsumer />
      </PlayfitProvider>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      screen.getByTestId("reset-btn").click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByTestId("reset-outcome").textContent).toBe("succeeded");
    // createInitialState() backs the cleared local state — on failure (previous test) it's
    // never invoked because resetProductState() throws before reaching that line.
    expect(createInitialState).toHaveBeenCalled();
  });

  it("keeps local state and does not sign out when deleteAccount's cloud delete fails", async () => {
    const { resetProductState } = await import("@playfit/core/store");
    const { supabase } = await import("@/lib/supabase/client");
    vi.mocked(resetProductState).mockRejectedValueOnce(new Error("server_error"));

    render(
      <PlayfitProvider platforms={[]} localFirst={true}>
        <TestConsumer />
      </PlayfitProvider>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      screen.getByTestId("delete-btn").click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByTestId("delete-outcome").textContent).toBe("failed");
    expect(screen.getByTestId("completed-at").textContent).toBe("2026-07-06T00:00:00Z");
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it("defaults a fresh profile's platform selection to every known platform", async () => {
    const { loadProductState } = await import("@playfit/core/store");
    // mockResolvedValue (not -Once): the test mock's onAuthStateChange fires synchronously
    // in addition to ensureSession()'s async getSession(), so the boot effect's authUser
    // dependency can change twice and re-run boot() a second time in this test harness.
    vi.mocked(loadProductState).mockResolvedValue({
      user: {
        deviceId: "test-device-id",
        onboardingCompletedAt: null,
        onboarding: {
          step: "platforms",
          likedGameIds: [],
          dislikedGameIds: [],
          platforms: [],
        },
        gameStates: {},
        profile: null,
      },
      // biome-ignore lint/suspicious/noExplicitAny: partial mock state, cast to satisfy ProductState
    } as any);

    render(
      <PlayfitProvider
        platforms={
          [
            { platformId: "ps5", displayName: "PS5" },
            { platformId: "switch_2", displayName: "Switch 2" },
            { platformId: "pc", displayName: "PC" },
            // biome-ignore lint/suspicious/noExplicitAny: minimal platform fixture
          ] as any
        }
        localFirst={true}
      >
        <TestConsumer />
      </PlayfitProvider>,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(screen.getByTestId("platform-count").textContent).toBe("3");
  });

  it("leaves an already-completed profile's platform selection untouched", async () => {
    const { loadProductState } = await import("@playfit/core/store");
    vi.mocked(loadProductState).mockResolvedValue({
      user: {
        deviceId: "test-device-id",
        onboardingCompletedAt: "2026-07-06T00:00:00Z",
        onboarding: {
          step: "completed",
          likedGameIds: ["game1"],
          dislikedGameIds: [],
          platforms: [{ platformId: "ps5", status: "available" }],
        },
        gameStates: {},
        profile: { nintendo: 0.8 },
      },
      // biome-ignore lint/suspicious/noExplicitAny: partial mock state, cast to satisfy ProductState
    } as any);

    render(
      <PlayfitProvider
        platforms={
          [
            { platformId: "ps5", displayName: "PS5" },
            { platformId: "switch_2", displayName: "Switch 2" },
            { platformId: "pc", displayName: "PC" },
            // biome-ignore lint/suspicious/noExplicitAny: minimal platform fixture
          ] as any
        }
        localFirst={true}
      >
        <TestConsumer />
      </PlayfitProvider>,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(screen.getByTestId("platform-count").textContent).toBe("1");
  });
});
