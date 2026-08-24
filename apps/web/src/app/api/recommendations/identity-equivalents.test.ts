import type { ProductState } from "@playfit/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  createAnonClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createAnonClient: mocks.createAnonClient,
}));

function baseState(gameStates: ProductState["user"]["gameStates"] = {}): ProductState {
  return {
    version: 2,
    stateVersion: "1",
    user: {
      onboarding: {
        step: "dislikes",
        platforms: [],
        likedGameIds: [],
        dislikedGameIds: [],
      },
      onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
      profile: null,
      gameStates,
      lastUpdatedAt: null,
    },
  } as unknown as ProductState;
}

function gameState(overrides: Partial<ProductState["user"]["gameStates"][string]>) {
  return {
    gameId: "x",
    title: "x",
    inBacklog: false,
    inWishlist: false,
    inPlayfitPicks: false,
    source: "manual",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as ProductState["user"]["gameStates"][string];
}

describe("buildIdentityExpandedGameStates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAnonClient.mockReturnValue({ rpc: mocks.rpc });
  });

  it("skips the RPC entirely when there are no known game ids", async () => {
    const { buildIdentityExpandedGameStates } = await import("./identity-equivalents");
    const state = baseState({});
    await expect(buildIdentityExpandedGameStates(state)).resolves.toBeUndefined();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not treat want_to_play or a plain backlog entry as known", async () => {
    const { buildIdentityExpandedGameStates } = await import("./identity-equivalents");
    const state = baseState({
      "witcher3-base": gameState({ gameId: "witcher3-base", status: "want_to_play" }),
    });
    await expect(buildIdentityExpandedGameStates(state)).resolves.toBeUndefined();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  describe.each([
    ["completed", { status: "completed" }],
    ["beaten", { status: "beaten" }],
    ["dropped (abandoned)", { status: "abandoned" }],
    ["on_hold", { status: "on_hold" }],
    ["shelved", { status: "shelved" }],
    ["currently playing", { status: "playing" }],
    ["excluded / not-for-me", { excluded: true }],
    ["currently picked (Playfit Picks)", { inPlayfitPicks: true }],
    ["wishlisted", { inWishlist: true }],
  ] as const)("Witcher 3 group: Complete Edition is %s", (_label, overrides) => {
    it("expands to the other confirmed group members and excludes them from lookup, without touching the source id or overriding real state", async () => {
      mocks.rpc.mockResolvedValue({
        data: [
          { source_game_id: "witcher3-complete", equivalent_game_id: "witcher3-complete" },
          { source_game_id: "witcher3-complete", equivalent_game_id: "witcher3-base" },
          { source_game_id: "witcher3-complete", equivalent_game_id: "witcher3-goty" },
        ],
        error: null,
      });
      const { buildIdentityExpandedGameStates } = await import("./identity-equivalents");
      const state = baseState({
        "witcher3-complete": gameState({ gameId: "witcher3-complete", ...overrides }),
      });

      const result = await buildIdentityExpandedGameStates(state);

      expect(mocks.rpc).toHaveBeenCalledWith("confirmed_identity_equivalents", {
        p_game_ids: ["witcher3-complete"],
      });
      expect(result).toMatchObject({
        "witcher3-complete": state.user.gameStates["witcher3-complete"],
        "witcher3-base": { excluded: true },
        "witcher3-goty": { excluded: true },
      });
    });
  });

  it("Skyrim group: Special Edition known excludes base and Anniversary Edition", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        { source_game_id: "skyrim-special", equivalent_game_id: "skyrim-special" },
        { source_game_id: "skyrim-special", equivalent_game_id: "skyrim-base" },
        { source_game_id: "skyrim-special", equivalent_game_id: "skyrim-anniversary" },
      ],
      error: null,
    });
    const { buildIdentityExpandedGameStates } = await import("./identity-equivalents");
    const state = baseState({
      "skyrim-special": gameState({ gameId: "skyrim-special", status: "completed" }),
    });

    const result = await buildIdentityExpandedGameStates(state);

    expect(result).toMatchObject({
      "skyrim-base": { excluded: true },
      "skyrim-anniversary": { excluded: true },
    });
  });

  it("Dark Souls pair: Remastered known excludes the base edition", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        { source_game_id: "dark-souls-remastered", equivalent_game_id: "dark-souls-remastered" },
        { source_game_id: "dark-souls-remastered", equivalent_game_id: "dark-souls" },
      ],
      error: null,
    });
    const { buildIdentityExpandedGameStates } = await import("./identity-equivalents");
    const state = baseState({
      "dark-souls-remastered": gameState({ gameId: "dark-souls-remastered", status: "beaten" }),
    });

    const result = await buildIdentityExpandedGameStates(state);

    expect(result).toMatchObject({ "dark-souls": { excluded: true } });
  });

  it("onboarding loved and onboarding missed ids are expanded the same way", async () => {
    mocks.rpc.mockImplementation((_fn: string, args: { p_game_ids: string[] }) => {
      expect(args.p_game_ids.sort()).toEqual(["fifa-23", "persona-5"].sort());
      return Promise.resolve({
        data: [
          { source_game_id: "persona-5", equivalent_game_id: "persona-5" },
          { source_game_id: "fifa-23", equivalent_game_id: "fifa-23" },
        ],
        error: null,
      });
    });
    const { buildIdentityExpandedGameStates } = await import("./identity-equivalents");
    const state = {
      ...baseState({}),
      user: {
        ...baseState({}).user,
        onboarding: {
          step: "dislikes",
          platforms: [],
          likedGameIds: ["persona-5"],
          dislikedGameIds: ["fifa-23"],
        },
      },
    } as unknown as ProductState;

    await buildIdentityExpandedGameStates(state);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  describe("negative controls: no confirmed group means no propagation", () => {
    it.each([
      ["Persona 5 -> Royal", "persona-5"],
      ["RE4 2005 -> RE4 remake", "re4-2005"],
      ["FIFA 23 -> FIFA 24", "fifa-23"],
      ["Witcher 3 -> Blood and Wine (DLC, not an edition group)", "witcher3-base"],
      ["Ocarina -> Collector's Edition (ungrouped)", "ocarina-of-time"],
    ])("%s: RPC returns only the self row, no unrelated title is excluded", async (_label, gameId) => {
      mocks.rpc.mockResolvedValue({
        data: [{ source_game_id: gameId, equivalent_game_id: gameId }],
        error: null,
      });
      const { buildIdentityExpandedGameStates } = await import("./identity-equivalents");
      const state = baseState({
        [gameId]: gameState({ gameId, status: "completed" }),
      });

      const result = await buildIdentityExpandedGameStates(state);

      // Self already has a real entry, so no addition is produced at all.
      expect(result).toBeUndefined();
    });
  });

  it("never overrides a game_id that already has its own real gameStates entry", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        { source_game_id: "witcher3-complete", equivalent_game_id: "witcher3-complete" },
        { source_game_id: "witcher3-complete", equivalent_game_id: "witcher3-base" },
      ],
      error: null,
    });
    const { buildIdentityExpandedGameStates } = await import("./identity-equivalents");
    const state = baseState({
      "witcher3-complete": gameState({ gameId: "witcher3-complete", status: "completed" }),
      // User explicitly wants to play the base edition too -- real intent
      // must win over identity-derived inference.
      "witcher3-base": gameState({ gameId: "witcher3-base", status: "want_to_play" }),
    });

    const result = await buildIdentityExpandedGameStates(state);

    expect(result).toBeUndefined();
  });

  it("does not add loved/liked state, tags, or ratings -- only excluded:true", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        { source_game_id: "witcher3-complete", equivalent_game_id: "witcher3-complete" },
        { source_game_id: "witcher3-complete", equivalent_game_id: "witcher3-base" },
      ],
      error: null,
    });
    const { buildIdentityExpandedGameStates } = await import("./identity-equivalents");
    const state = baseState({
      "witcher3-complete": gameState({
        gameId: "witcher3-complete",
        status: "completed",
        rating: 5,
      }),
    });

    const result = await buildIdentityExpandedGameStates(state);

    expect(result?.["witcher3-base"]).toEqual({ excluded: true });
  });

  it("fails open (returns undefined) when the RPC errors", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { buildIdentityExpandedGameStates } = await import("./identity-equivalents");
    const state = baseState({
      "witcher3-complete": gameState({ gameId: "witcher3-complete", status: "completed" }),
    });

    await expect(buildIdentityExpandedGameStates(state)).resolves.toBeUndefined();
  });

  it("fails open when the RPC returns a non-array payload", async () => {
    mocks.rpc.mockResolvedValue({ data: { unexpected: "shape" }, error: null });
    const { buildIdentityExpandedGameStates } = await import("./identity-equivalents");
    const state = baseState({
      "witcher3-complete": gameState({ gameId: "witcher3-complete", status: "completed" }),
    });

    await expect(buildIdentityExpandedGameStates(state)).resolves.toBeUndefined();
  });

  it("returns undefined when no group is confirmed for any known id (empty rows)", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const { buildIdentityExpandedGameStates } = await import("./identity-equivalents");
    const state = baseState({
      "unrelated-game": gameState({ gameId: "unrelated-game", status: "completed" }),
    });

    await expect(buildIdentityExpandedGameStates(state)).resolves.toBeUndefined();
  });
});
