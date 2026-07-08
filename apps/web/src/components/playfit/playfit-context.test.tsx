import { act, cleanup, render, screen } from "@testing-library/react";
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
    },
    rpc: vi.fn(),
  },
}));

// Helper component to consume context and trigger mutations
function TestConsumer() {
  const { state, setPlayfitPick, applyDecisionFeedback } = usePlayfit();

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
});
