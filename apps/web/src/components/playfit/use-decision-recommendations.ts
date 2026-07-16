"use client";

import type { ProductDecisionFeedback, RankedSeedGame } from "@playfit/core/types";
import { useEffect, useMemo, useRef, useState } from "react";
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
    onUndo?: () => void,
  ) => void;
  setPlayfitPick: (gameId: string, picked: boolean) => void;
  resetLocalState: () => void;
}) {
  const [slowLoading, setSlowLoading] = useState(false);
  const [recommendationRefreshPending, setRecommendationRefreshPending] = useState(false);
  const recommendationRefreshPendingRef = useRef(false);
  const previousSaveStatusRef = useRef<SaveStatus>(saveStatus);
  const [pool, setPool] = useState<RankedSeedGame[]>([]);
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
  const isWaitingForCandidates = recommendationRefreshPending || refreshing;

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

    const timeoutId = window.setTimeout(() => setSlowLoading(true), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [isInitialLoading]);

  const visiblePool = useMemo(
    () => pool.filter((entry) => !excludedIds.has(entry.game.gameId)),
    [pool, excludedIds],
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
    const modelEntries = [model.primary, ...model.alternatives].filter(
      (entry): entry is RankedSeedGame => entry !== null,
    );

    if (modelEntries.length === 0) return;

    setPool((previousPool) => {
      const existingIds = new Set(previousPool.map((entry) => entry.game.gameId));
      const newEntries = modelEntries.filter((entry) => !existingIds.has(entry.game.gameId));
      if (newEntries.length === 0 && previousPool.length > 0) {
        exhaustedRef.current = true;
      }
      return newEntries.length > 0 ? [...previousPool, ...newEntries] : previousPool;
    });
  }, [model]);

  useEffect(() => {
    if (
      visiblePool.length <= 2 &&
      !exhaustedRef.current &&
      !refreshing &&
      !recommendationRefreshPending &&
      profileReady
    ) {
      refreshRecommendations();
    }
  }, [
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

  function handleFeedback(entry: RankedSeedGame, feedback: ProductDecisionFeedback) {
    const gameId = entry.game.gameId;
    setExcludedIds((previousIds) => new Set([...previousIds, gameId]));
    advancePrimaryPast(gameId);
    recommendationRefreshPendingRef.current = true;
    setRecommendationRefreshPending(true);
    applyDecisionFeedback(gameId, feedback, () => {
      setExcludedIds((previousIds) => {
        const nextIds = new Set(previousIds);
        nextIds.delete(gameId);
        return nextIds;
      });
      setStablePrimaryId(gameId);
      recommendationRefreshPendingRef.current = false;
      setRecommendationRefreshPending(false);
    });
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
    loadError,
    loading,
    pool,
    primary,
    recommendationRefreshPending,
    refreshing,
    setExcludedIds,
    slowLoading,
    visiblePool,
  };
}
