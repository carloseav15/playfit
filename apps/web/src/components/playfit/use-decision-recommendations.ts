"use client";

import type {
  ProductDecisionFeedback,
  ProductPlayNextModel,
  ProductTasteActionClientResult,
  RankedSeedGame,
} from "@playfit/core/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { markOnboardingPhase } from "./onboarding-flow-tracing";
import type { SaveStatus } from "./playfit-context";
import { usePlayNextRecommendations } from "./use-play-next-recommendations";

export function shouldRefreshRecommendationsAfterSave({
  pending,
  previousSaveStatus,
  saveStatus,
}: {
  pending: boolean;
  previousSaveStatus: SaveStatus;
  saveStatus: SaveStatus;
}) {
  return pending && previousSaveStatus === "saving" && saveStatus === "saved";
}

export function shouldShowNoRecommendations({
  primary,
  loading,
  refreshing,
  refreshPending,
}: {
  primary: RankedSeedGame | null;
  loading: boolean;
  refreshing: boolean;
  refreshPending: boolean;
}) {
  return !primary && !loading && !refreshing && !refreshPending;
}

export function shouldRefreshRecommendationPool({
  poolSize,
  visiblePoolSize,
  exhausted,
  refreshing,
  refreshPending,
  profileReady,
}: {
  poolSize: number;
  visiblePoolSize: number;
  exhausted: boolean;
  refreshing: boolean;
  refreshPending: boolean;
  profileReady: boolean;
}) {
  return (
    poolSize > 0 &&
    visiblePoolSize <= 2 &&
    !exhausted &&
    !refreshing &&
    !refreshPending &&
    profileReady
  );
}

export function recommendationEntries(model: ProductPlayNextModel): RankedSeedGame[] {
  return [model.primary, ...model.alternatives].filter(
    (entry): entry is RankedSeedGame => entry !== null,
  );
}

export function updateRecommendationPool({
  previousPool,
  previousStateVersion,
  model,
}: {
  previousPool: RankedSeedGame[];
  previousStateVersion: string | null;
  model: ProductPlayNextModel;
}): RankedSeedGame[] {
  const entries = recommendationEntries(model);
  if (previousStateVersion !== model.stateVersion) return entries;

  const existingIds = new Set(previousPool.map((entry) => entry.game.gameId));
  return [...previousPool, ...entries.filter((entry) => !existingIds.has(entry.game.gameId))];
}

function isOlderStateVersion(candidate: string, current: string | null) {
  if (!current || !/^\d+$/.test(candidate) || !/^\d+$/.test(current)) return false;
  return BigInt(candidate) < BigInt(current);
}

export function visibleRecommendationPool({
  pool,
  excludedIds,
  decisionPending,
}: {
  pool: RankedSeedGame[];
  excludedIds: Set<string>;
  decisionPending: boolean;
}) {
  if (decisionPending) return [];
  return pool.filter((entry) => !excludedIds.has(entry.game.gameId));
}

export function useDecisionRecommendations({
  profileReady,
  saveStatus,
  applyDecisionFeedback,
  setPlayfitPick,
  resetLocalState,
}: {
  profileReady: boolean;
  saveStatus: SaveStatus;
  applyDecisionFeedback: (
    gameId: string,
    feedback: ProductDecisionFeedback,
    onUndo?: (result: ProductTasteActionClientResult) => void,
  ) => Promise<ProductTasteActionClientResult>;
  setPlayfitPick: (gameId: string, picked: boolean) => void;
  resetLocalState: () => void;
}) {
  const [slowLoading, setSlowLoading] = useState(false);
  const [recommendationRefreshPending, setRecommendationRefreshPending] = useState(false);
  const recommendationRefreshPendingRef = useRef(false);
  const previousSaveStatusRef = useRef<SaveStatus>(saveStatus);
  const [pool, setPool] = useState<RankedSeedGame[]>([]);
  const poolStateVersionRef = useRef<string | null>(null);
  const [decisionPending, setDecisionPending] = useState(false);
  const [decisionRefreshError, setDecisionRefreshError] = useState<string | null>(null);
  const [stablePrimaryId, setStablePrimaryId] = useState<string | null>(null);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(() => new Set());
  const initialPrimarySetRef = useRef(false);
  const exhaustedRef = useRef(false);
  const { model, loading, refreshing, loadError, refreshRecommendations } =
    usePlayNextRecommendations({
      enabled: profileReady,
      errorMessage: "Play Next could not be refreshed.",
      onNeedsResync: resetLocalState,
    });

  const isInitialLoading = loading && !model;
  const isWaitingForCandidates = decisionPending || recommendationRefreshPending || refreshing;

  useEffect(() => {
    if (
      shouldRefreshRecommendationsAfterSave({
        pending: recommendationRefreshPendingRef.current,
        previousSaveStatus: previousSaveStatusRef.current,
        saveStatus,
      })
    ) {
      recommendationRefreshPendingRef.current = false;
      setRecommendationRefreshPending(false);
      refreshRecommendations();
    }

    if (recommendationRefreshPendingRef.current && saveStatus === "error") {
      recommendationRefreshPendingRef.current = false;
      setRecommendationRefreshPending(false);
    }

    previousSaveStatusRef.current = saveStatus;
  }, [refreshRecommendations, saveStatus]);

  useEffect(() => {
    if (!profileReady) {
      recommendationRefreshPendingRef.current = false;
      setRecommendationRefreshPending(false);
    }
  }, [profileReady]);

  useEffect(() => {
    if (!isInitialLoading) {
      setSlowLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      markOnboardingPhase("recommendation_wait_slow", { thresholdMs: 3000 });
      setSlowLoading(true);
    }, 3000);
    return () => window.clearTimeout(timeoutId);
  }, [isInitialLoading]);

  const visiblePool = useMemo(
    () => visibleRecommendationPool({ pool, excludedIds, decisionPending }),
    [pool, excludedIds, decisionPending],
  );

  const primary = useMemo(
    () =>
      visiblePool.find((entry) => entry.game.gameId === stablePrimaryId) ?? visiblePool[0] ?? null,
    [visiblePool, stablePrimaryId],
  );

  const primaryIndex = useMemo(
    () => visiblePool.findIndex((entry) => entry.game.gameId === primary?.game.gameId),
    [visiblePool, primary],
  );

  const alternatives = useMemo(() => {
    if (primaryIndex < 0 || !primary) return [];
    return visiblePool.slice(primaryIndex + 1, primaryIndex + 4);
  }, [visiblePool, primaryIndex, primary]);

  useEffect(() => {
    if (model?.primary && !initialPrimarySetRef.current) {
      initialPrimarySetRef.current = true;
      setStablePrimaryId(model.primary.game.gameId);
    }
  }, [model]);

  useEffect(() => {
    if (!model) return;
    if (isOlderStateVersion(model.stateVersion, poolStateVersionRef.current)) return;

    setPool((previousPool) => {
      const nextPool = updateRecommendationPool({
        previousPool,
        previousStateVersion: poolStateVersionRef.current,
        model,
      });
      if (nextPool.length === previousPool.length && previousPool.length > 0) {
        exhaustedRef.current = true;
      }
      poolStateVersionRef.current = model.stateVersion;
      return nextPool;
    });
  }, [model]);

  useEffect(() => {
    if (
      shouldRefreshRecommendationPool({
        poolSize: pool.length,
        visiblePoolSize: visiblePool.length,
        exhausted: exhaustedRef.current,
        refreshing,
        refreshPending: recommendationRefreshPending,
        profileReady,
      })
    ) {
      refreshRecommendations();
    }
  }, [
    pool.length,
    visiblePool.length,
    refreshing,
    recommendationRefreshPending,
    profileReady,
    refreshRecommendations,
  ]);

  useEffect(() => {
    if (primary?.game.gameId) {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
    }
  }, [primary?.game.gameId]);

  function advancePrimaryPast(currentGameId: string) {
    const currentIndex = visiblePool.findIndex((entry) => entry.game.gameId === currentGameId);
    const next = visiblePool[currentIndex + 1] ?? null;
    setStablePrimaryId(next?.game.gameId ?? null);
  }

  async function handleFeedback(entry: RankedSeedGame, feedback: ProductDecisionFeedback) {
    const gameId = entry.game.gameId;
    const isCanonicalFeedback =
      feedback === "not_for_me" ||
      feedback === "loved" ||
      feedback === "liked" ||
      feedback === "played_loved" ||
      feedback === "played_liked";

    if (!isCanonicalFeedback) {
      setExcludedIds((previousIds) => new Set([...previousIds, gameId]));
      advancePrimaryPast(gameId);
      recommendationRefreshPendingRef.current = true;
      setRecommendationRefreshPending(true);
      void applyDecisionFeedback(gameId, feedback, () => {
        setExcludedIds((previousIds) => {
          const nextIds = new Set(previousIds);
          nextIds.delete(gameId);
          return nextIds;
        });
        setStablePrimaryId(gameId);
        recommendationRefreshPendingRef.current = false;
        setRecommendationRefreshPending(false);
      });
      return;
    }

    setDecisionPending(true);
    setDecisionRefreshError(null);
    try {
      const result = await applyDecisionFeedback(gameId, feedback, (undoResult) => {
        if (undoResult.ok && undoResult.canonical) {
          const undoModel = undoResult.response.recommendationModel;
          const undoPool = recommendationEntries(undoModel);
          poolStateVersionRef.current = undoModel.stateVersion;
          exhaustedRef.current = undoPool.length === 0;
          setPool(undoPool);
          setStablePrimaryId(undoModel.primary?.game.gameId ?? null);
          setDecisionRefreshError(null);
          return;
        }
        refreshRecommendations();
      });

      if (result.ok && result.canonical) {
        const authoritativeModel = result.response.recommendationModel;
        const nextPool = recommendationEntries(authoritativeModel);
        poolStateVersionRef.current = authoritativeModel.stateVersion;
        exhaustedRef.current = nextPool.length === 0;
        setPool(nextPool);
        setStablePrimaryId(authoritativeModel.primary?.game.gameId ?? null);
      } else if (!result.ok && result.canonical && result.decisionSaved) {
        poolStateVersionRef.current = result.stateVersion ?? poolStateVersionRef.current;
        exhaustedRef.current = true;
        setPool([]);
        setStablePrimaryId(null);
        setDecisionRefreshError(
          "Your decision was saved, but the updated Play Next ranking is temporarily unavailable.",
        );
      }
    } finally {
      setDecisionPending(false);
    }
  }

  function handleAddPick(entry: RankedSeedGame) {
    setExcludedIds((previousIds) => new Set([...previousIds, entry.game.gameId]));
    advancePrimaryPast(entry.game.gameId);
    recommendationRefreshPendingRef.current = true;
    setRecommendationRefreshPending(true);
    setPlayfitPick(entry.game.gameId, true);
  }

  function handleShowAnother(entry: RankedSeedGame) {
    setExcludedIds((previousIds) => new Set([...previousIds, entry.game.gameId]));
    advancePrimaryPast(entry.game.gameId);
  }

  return {
    alternatives,
    handleAddPick,
    handleFeedback,
    handleShowAnother,
    isTransient: isInitialLoading,
    isWaitingForCandidates,
    loadError: decisionRefreshError ?? loadError,
    loading,
    pool,
    primary,
    recommendationRefreshPending,
    refreshing,
    setExcludedIds,
    slowLoading,
    visiblePool,
    isInitialLoading,
  };
}
