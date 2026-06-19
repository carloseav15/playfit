"use client";

import type {
  ProductDecisionFeedback,
  ProductGameState,
  ProductPlayStatus,
  ProductTasteSignalSource,
  RankedSeedGame,
  SeedGame,
} from "@playfit/core/types";
import { cn } from "@/lib/utils";
import { TasteHistory, TasteMap } from "../taste-components";
import { TasteMapVisualizer } from "../taste-map-visualizer";
import type { HistoryOrActivityEntry } from "../taste-model";

interface TasteDesktopProps {
  // biome-ignore lint/suspicious/noExplicitAny: complex buildTasteModel return type
  model: any;
  historyAndActivityEntries: HistoryOrActivityEntry[];
  gamesById: Map<string, SeedGame>;
  gameStates: Record<string, ProductGameState>;
  recs: RankedSeedGame[];
  activeMainTab: "taste" | "activity";
  setActiveMainTab: (tab: "taste" | "activity") => void;
  mapView: "visual" | "list";
  setMapView: (view: "visual" | "list") => void;
  changingId: string | null;
  setChangingId: (id: string | null) => void;
  applyDecisionFeedback: (gameId: string, feedback: ProductDecisionFeedback) => void;
  setPlayStatus: (gameId: string, status: ProductPlayStatus | undefined) => void;
  setPlayfitPick: (gameId: string, pick: boolean) => void;
  removeTasteSignal: (gameId: string, source: ProductTasteSignalSource) => void;
  startPlayfitPick: (gameId: string) => void;
}

export function TasteDesktop({
  model,
  historyAndActivityEntries,
  gamesById,
  gameStates,
  recs,
  activeMainTab,
  setActiveMainTab,
  mapView,
  setMapView,
  changingId,
  setChangingId,
  applyDecisionFeedback,
  setPlayStatus,
  setPlayfitPick,
  removeTasteSignal,
  startPlayfitPick,
}: TasteDesktopProps) {
  return (
    <div className="hidden md:flex flex-col gap-6">
      <div className="flex gap-1 bg-secondary/60 p-1.5 rounded-2xl border border-border/60 shrink-0">
        {(["taste", "activity"] as const).map((tab) => {
          const labels = {
            taste: "Your Taste",
            activity: "Activity",
          };
          const counts = {
            taste: model.mapTraits.length,
            activity: historyAndActivityEntries.length,
          };
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveMainTab(tab)}
              className={cn(
                "flex-1 h-10 px-4 text-sm rounded-xl font-bold transition-all flex items-center justify-center gap-2",
                activeMainTab === tab
                  ? "bg-card shadow-md text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {labels[tab]}
              <span className="opacity-50 text-[10px] font-mono">({counts[tab]})</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-6 pb-4">
        {activeMainTab === "taste" && (
          <>
            <div className="grid grid-cols-3 gap-3.5">
              <div className="rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Preferences
                </p>
                <strong className="mt-1 block font-mono text-2xl font-black text-foreground">
                  {model.evidenceCount}
                </strong>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-positive">
                  Liked
                </p>
                <strong className="mt-1 block font-mono text-2xl font-black text-positive">
                  {model.positiveCount}
                </strong>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-negative">
                  Avoided
                </p>
                <strong className="mt-1 block font-mono text-2xl font-black text-negative">
                  {model.negativeCount}
                </strong>
              </div>
            </div>

            <div className="flex gap-2 p-1.5 bg-secondary/50 border border-border/60 rounded-2xl shrink-0">
              <button
                type="button"
                onClick={() => setMapView("visual")}
                className={cn(
                  "flex-1 h-9 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                  mapView === "visual"
                    ? "bg-card shadow-md text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Visual Map (2D)
              </button>
              <button
                type="button"
                onClick={() => setMapView("list")}
                className={cn(
                  "flex-1 h-9 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                  mapView === "list"
                    ? "bg-card shadow-md text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Traits List
              </button>
            </div>

            {mapView === "visual" ? (
              <TasteMapVisualizer
                gamesById={gamesById}
                gameStates={gameStates}
                recommendations={recs}
              />
            ) : (
              <TasteMap traits={model.mapTraits} />
            )}
          </>
        )}

        {activeMainTab === "activity" && (
          <TasteHistory
            entries={historyAndActivityEntries}
            changingId={changingId}
            onToggleChange={(gameId) => setChangingId(changingId === gameId ? null : gameId)}
            onChange={(entry, feedback) => {
              applyDecisionFeedback(entry.gameId, feedback);
              setChangingId(null);
            }}
            onRemove={(entry) => {
              if (entry.decision === "playing") {
                setPlayStatus(entry.gameId, undefined);
              } else if (entry.decision === "picks") {
                setPlayfitPick(entry.gameId, false);
              } else if (entry.source !== "active_state") {
                removeTasteSignal(entry.gameId, entry.source);
              }
              setChangingId(null);
            }}
            onStart={(gameId) => {
              startPlayfitPick(gameId);
            }}
          />
        )}
      </div>
    </div>
  );
}
