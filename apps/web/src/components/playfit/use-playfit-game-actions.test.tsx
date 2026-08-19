import type {
  ProductPlayNextModel,
  ProductState,
  ProductTasteActionResponse,
  ProductUndoDecisionResponse,
} from "@playfit/core/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductUiState } from "./playfit-context-types";
import { usePlayfitGameActions } from "./use-playfit-game-actions";

const mocks = vi.hoisted(() => ({
  authenticatedFetch: vi.fn(),
  loadProductStateOrNull: vi.fn(),
  addGamesToCache: vi.fn(),
  addRecommendationsToSessionCache: vi.fn(),
}));

vi.mock("@playfit/core/store", () => ({
  authenticatedFetch: mocks.authenticatedFetch,
  loadProductStateOrNull: mocks.loadProductStateOrNull,
}));

vi.mock("@/lib/game-cache", () => ({
  addGamesToCache: mocks.addGamesToCache,
  getCachedGame: vi.fn(),
}));

vi.mock("./recommendation-cache", () => ({
  addRecommendationsToSessionCache: mocks.addRecommendationsToSessionCache,
}));

function state(stateVersion: string, withDecision: boolean): ProductState {
  return {
    version: 2,
    stateVersion,
    user: {
      onboarding: {
        step: "dislikes",
        platforms: [{ platformId: "pc", status: "available" }],
        likedGameIds: [],
        dislikedGameIds: [],
      },
      onboardingCompletedAt: "2026-08-18T00:00:00.000Z",
      profile: {
        summary: "Test profile",
        likedGenres: [],
        avoidedGenres: withDecision ? ["action"] : [],
        likedTags: {},
        dislikedTags: withDecision ? { fast_paced: 1 } : {},
        ratedCount: withDecision ? 1 : 0,
        signals: [],
      },
      gameStates: withDecision
        ? {
            target: {
              gameId: "target",
              title: "Target",
              rating: 2,
              excluded: true,
              inBacklog: false,
              inWishlist: false,
              inPlayfitPicks: false,
              source: "manual",
              createdAt: "2026-08-18T00:00:00.000Z",
              updatedAt: "2026-08-18T00:00:00.000Z",
            },
          }
        : {},
      lastUpdatedAt: "2026-08-18T00:00:00.000Z",
    },
  };
}

function model(stateVersion: string): ProductPlayNextModel {
  return {
    primary: null,
    alternatives: [],
    savedPickIds: [],
    stateVersion,
    rankingMetadata: { profileStateVersion: stateVersion, candidates: [] },
  };
}

describe("canonical Undo UI flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadProductStateOrNull.mockResolvedValue(null);
  });

  it("shows Undoing and confirms Undone only after the authoritative response", async () => {
    const afterDecision = state("2", true);
    const afterUndo = state("3", false);
    if (!afterDecision.user.profile || !afterUndo.user.profile) {
      throw new Error("Test profiles are required");
    }
    const decisionResponse: ProductTasteActionResponse = {
      operationId: "11111111-1111-4111-8111-111111111111",
      stateVersion: "2",
      state: afterDecision,
      gameState: afterDecision.user.gameStates.target,
      profile: { ...afterDecision.user.profile, stateVersion: "2" },
      recommendationModel: model("2"),
    };
    const undoResponse: ProductUndoDecisionResponse = {
      operationId: "22222222-2222-4222-8222-222222222222",
      stateVersion: "3",
      state: afterUndo,
      gameState: null,
      profile: { ...afterUndo.user.profile, stateVersion: "3" },
      recommendationModel: model("3"),
      undo: {
        targetOperationId: decisionResponse.operationId,
        gameId: "target",
        restoredPreviousState: false,
      },
    };
    let resolveUndo: ((response: Response) => void) | null = null;
    mocks.authenticatedFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify(decisionResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveUndo = resolve;
          }),
      );

    let currentState = state("1", false);
    let ui: ProductUiState = {
      activeTab: "today",
      onboardingQuery: "",
      statusMessage: null,
      saveStatus: "idle",
      onboardingCompletionPhase: "idle",
      undoAction: null,
    };
    const replaceAuthoritativeState = vi.fn((next: ProductState) => {
      currentState = next;
    });
    const updateUi = vi.fn((action: React.SetStateAction<ProductUiState>) => {
      ui = typeof action === "function" ? action(ui) : action;
    });
    const { result } = renderHook(() =>
      usePlayfitGameActions({
        state: currentState,
        updateState: vi.fn(),
        updateUi,
        flushSave: vi.fn(async () => undefined),
        getCurrentState: () => currentState,
        replaceAuthoritativeState,
      }),
    );

    await act(async () => {
      await result.current.applyDecisionFeedback("target", "not_for_me");
    });
    expect(ui.statusMessage).toBe("Noted. Playfit will find a better fit.");
    expect(ui.undoAction).toBeTypeOf("function");

    act(() => ui.undoAction?.());
    await waitFor(() => expect(ui.statusMessage).toBe("Undoing…"));
    expect(ui.statusMessage).not.toBe("Undone.");

    await act(async () => {
      resolveUndo?.(
        new Response(JSON.stringify(undoResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    });
    await waitFor(() => expect(ui.statusMessage).toBe("Undone."));

    expect(currentState.stateVersion).toBe("3");
    expect(replaceAuthoritativeState).toHaveBeenLastCalledWith(afterUndo);
    const undoRequest = JSON.parse(
      String((mocks.authenticatedFetch.mock.calls[1]?.[1] as RequestInit | undefined)?.body),
    );
    const decisionRequest = JSON.parse(
      String((mocks.authenticatedFetch.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    );
    expect(undoRequest).toMatchObject({
      actionType: "undo_decision",
      expectedStateVersion: "2",
      targetOperationId: decisionRequest.operationId,
    });
  });

  it("routes Started through the canonical endpoint without sending taste fields", async () => {
    const before = state("1", false);
    const after = state("2", false);
    after.user.gameStates.target = {
      gameId: "target",
      title: "Target",
      status: "playing",
      inBacklog: false,
      inWishlist: false,
      inPlayfitPicks: false,
      excluded: false,
      source: "manual",
      createdAt: "2026-08-18T00:00:00.000Z",
      updatedAt: "2026-08-18T00:00:00.000Z",
    };
    const profile = after.user.profile;
    if (!profile) throw new Error("Test profile is required");
    const response: ProductTasteActionResponse = {
      operationId: "11111111-1111-4111-8111-111111111111",
      stateVersion: "2",
      state: after,
      gameState: after.user.gameStates.target,
      profile: { ...profile, stateVersion: "2" },
      recommendationModel: model("2"),
    };
    mocks.authenticatedFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    let currentState = before;
    const { result } = renderHook(() =>
      usePlayfitGameActions({
        state: currentState,
        updateState: vi.fn(),
        updateUi: vi.fn(),
        flushSave: vi.fn(async () => undefined),
        getCurrentState: () => currentState,
        replaceAuthoritativeState: (next) => {
          currentState = next;
        },
      }),
    );

    act(() => result.current.startPlayfitPick("target"));
    await waitFor(() => expect(currentState.stateVersion).toBe("2"));

    const request = JSON.parse(
      String((mocks.authenticatedFetch.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    );
    expect(request).toMatchObject({ actionType: "started", gameId: "target" });
    expect(request).not.toHaveProperty("played");
  });
});
