import type {
  ProductConfidence,
  ProductProfile,
  ProductState,
  ProductTodayModel,
  RankedSeedGame,
  SeedGame,
} from "../types";

type ScoreSeedGameWithContext = (
  game: SeedGame,
  state: ProductState,
  likedTags: Record<string, number>,
  dislikedTags: Record<string, number>,
  accessiblePlatformIds: Set<string>,
  profile: ProductProfile,
) => RankedSeedGame;

type BuildTodayModelDependencies = {
  buildAccessiblePlatformIds: (state: ProductState) => Set<string>;
  buildDislikedTagsFromProfile: (profile: ProductProfile) => Record<string, number>;
  buildLikedTagsFromProfile: (profile: ProductProfile) => Record<string, number>;
  confidenceRank: Record<ProductConfidence, number>;
  highFrictionThreshold: number;
  isPlayableNow: (entry: RankedSeedGame) => boolean;
  isScoredGame: (game: SeedGame) => boolean;
  scoreSeedGameWithContext: ScoreSeedGameWithContext;
  sortPlayingNow: (state: ProductState) => (left: RankedSeedGame, right: RankedSeedGame) => number;
};

export function buildTodayModel(
  games: SeedGame[],
  state: ProductState,
  profile: ProductProfile | null,
  dependencies: BuildTodayModelDependencies,
): ProductTodayModel {
  const debug = process.env.NODE_ENV === "development";
  if (!profile) {
    return { currentRun: [], nextUp: [], resume: [], picks: [] };
  }

  const onboardingGameIds = new Set([
    ...state.user.onboarding.likedGameIds,
    ...(state.user.onboarding.dislikedGameIds ?? []),
  ]);
  const likedTags = dependencies.buildLikedTagsFromProfile(profile);
  const dislikedTags = dependencies.buildDislikedTagsFromProfile(profile);
  const accessiblePlatformIds = dependencies.buildAccessiblePlatformIds(state);
  const allProfileTags = new Set([...Object.keys(likedTags), ...Object.keys(dislikedTags)]);
  const hasProfileTags = allProfileTags.size > 0;

  const afterScored = games.filter((game) => {
    if (!dependencies.isScoredGame(game)) return false;
    if (hasProfileTags && !game.tags.some((tag) => allProfileTags.has(tag))) {
      const gameState = state.user.gameStates[game.gameId];
      const hasState = gameState?.status || gameState?.inPlayfitPicks || gameState?.inWishlist;
      if (!hasState) return false;
    }
    return true;
  });
  const afterMap = afterScored.map((game) =>
    dependencies.scoreSeedGameWithContext(
      game,
      state,
      likedTags,
      dislikedTags,
      accessiblePlatformIds,
      profile,
    ),
  );
  const rankedFiltered = afterMap.filter((entry) => {
    const stateEntry = state.user.gameStates[entry.game.gameId];
    if (onboardingGameIds.has(entry.game.gameId)) return false;
    if (stateEntry?.status === "completed" || stateEntry?.status === "beaten") return false;
    if (stateEntry?.status === "abandoned") return false;
    if (stateEntry?.excluded) return false;
    return true;
  });

  if (debug) {
    const platformCounts: Record<string, number> = {};
    for (const entry of afterMap) {
      const key = entry.accessStatus;
      platformCounts[key] = (platformCounts[key] ?? 0) + 1;
    }
    const terminal = afterMap.filter((entry) => {
      const gameState = state.user.gameStates[entry.game.gameId];
      return (
        gameState?.status === "completed" ||
        gameState?.status === "beaten" ||
        gameState?.status === "abandoned" ||
        gameState?.excluded
      );
    });
    console.log(
      JSON.stringify({
        stage: "buildTodayModel",
        totalGames: games.length,
        afterIsScoredGame: afterScored.length,
        afterScore: afterMap.length,
        afterOnboardingExclusion: afterMap.length - (afterMap.length - rankedFiltered.length),
        afterTerminal: rankedFiltered.length,
        filteredAsOnboarding: afterMap.filter((entry) => onboardingGameIds.has(entry.game.gameId))
          .length,
        filteredAsTerminal: terminal.length,
        accessStatusDistribution: platformCounts,
        accessiblePlatformIds: [...accessiblePlatformIds],
      }),
    );
  }

  const currentRun = rankedFiltered
    .filter((entry) => state.user.gameStates[entry.game.gameId]?.status === "playing")
    .sort(dependencies.sortPlayingNow(state));
  const resume = rankedFiltered
    .filter(
      (entry) =>
        (state.user.gameStates[entry.game.gameId]?.status === "on_hold" ||
          state.user.gameStates[entry.game.gameId]?.status === "shelved") &&
        entry.accessStatus === "playable",
    )
    .sort((left, right) => right.affinityScore - left.affinityScore)
    .slice(0, 10);
  const picks = rankedFiltered
    .filter((entry) => entry.inPlayfitPicks && dependencies.isPlayableNow(entry))
    .sort(
      (left, right) =>
        right.affinityScore - left.affinityScore ||
        left.riskScore - right.riskScore ||
        dependencies.confidenceRank[right.confidence] -
          dependencies.confidenceRank[left.confidence],
    )
    .slice(0, 100);
  const playableCandidates = rankedFiltered.filter((entry) => {
    const stateEntry = state.user.gameStates[entry.game.gameId];
    return (
      dependencies.isPlayableNow(entry) &&
      entry.riskScore < dependencies.highFrictionThreshold &&
      stateEntry?.status !== "playing" &&
      stateEntry?.status !== "on_hold" &&
      stateEntry?.status !== "shelved" &&
      stateEntry?.status !== "abandoned" &&
      !entry.inWishlist &&
      !entry.inPlayfitPicks
    );
  });

  if (debug) {
    const reasons: Record<string, number> = {};
    for (const entry of rankedFiltered) {
      const stateEntry = state.user.gameStates[entry.game.gameId];
      if (!dependencies.isPlayableNow(entry)) {
        const key = `not_playable:${entry.accessStatus}`;
        reasons[key] = (reasons[key] ?? 0) + 1;
      } else if (entry.riskScore >= dependencies.highFrictionThreshold) {
        reasons[`high_risk:${entry.riskScore}`] =
          (reasons[`high_risk:${entry.riskScore}`] ?? 0) + 1;
      } else if (
        stateEntry?.status === "playing" ||
        stateEntry?.status === "on_hold" ||
        stateEntry?.status === "shelved" ||
        stateEntry?.status === "abandoned"
      ) {
        reasons[`status:${stateEntry.status}`] = (reasons[`status:${stateEntry.status}`] ?? 0) + 1;
      } else if (entry.inWishlist) {
        reasons.in_wishlist = (reasons.in_wishlist ?? 0) + 1;
      } else if (entry.inPlayfitPicks) {
        reasons.in_playfit_picks = (reasons.in_playfit_picks ?? 0) + 1;
      }
    }
    console.log(
      JSON.stringify({
        stage: "buildTodayModel.playableCandidates",
        rankedFiltered: rankedFiltered.length,
        playableCandidates: playableCandidates.length,
        notPlayableBreakdown: reasons,
        currentRun: currentRun.length,
        resume: resume.length,
        picks: picks.length,
        nextUp: playableCandidates.slice(0, 100).length,
      }),
    );
  }

  const sortedPlayable = playableCandidates.sort(
    (left, right) => right.affinityScore - left.affinityScore || left.riskScore - right.riskScore,
  );
  return { currentRun, nextUp: sortedPlayable.slice(0, 10), resume, picks };
}
