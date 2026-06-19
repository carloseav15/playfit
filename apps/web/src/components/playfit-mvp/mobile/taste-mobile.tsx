"use client";

import type {
  ProductDecisionFeedback,
  ProductGameState,
  ProductPlayStatus,
  ProductTasteSignalSource,
  RankedSeedGame,
  SeedGame,
} from "@playfit/core/types";
import { ChevronRight, History, Layers, ShieldCheck, Waves } from "lucide-react";
import { TasteHistory, TasteMap } from "../taste-components";
import { TasteMapVisualizer } from "../taste-map-visualizer";
import type { HistoryOrActivityEntry } from "../taste-model";

interface TasteMobileProps {
  // biome-ignore lint/suspicious/noExplicitAny: complex buildTasteModel return type
  model: any;
  historyAndActivityEntries: HistoryOrActivityEntry[];
  gamesById: Map<string, SeedGame>;
  gameStates: Record<string, ProductGameState>;
  recs: RankedSeedGame[];
  subView: "menu" | "map" | "list" | "activity";
  setSubView: (view: "menu" | "map" | "list" | "activity") => void;
  changingId: string | null;
  setChangingId: (id: string | null) => void;
  applyDecisionFeedback: (gameId: string, feedback: ProductDecisionFeedback) => void;
  setPlayStatus: (gameId: string, status: ProductPlayStatus | undefined) => void;
  setPlayfitPick: (gameId: string, pick: boolean) => void;
  removeTasteSignal: (gameId: string, source: ProductTasteSignalSource) => void;
  startPlayfitPick: (gameId: string) => void;
}

export function TasteMobile({
  model,
  historyAndActivityEntries,
  gamesById,
  gameStates,
  recs,
  subView,
  setSubView,
  changingId,
  setChangingId,
  applyDecisionFeedback,
  setPlayStatus,
  setPlayfitPick,
  removeTasteSignal,
  startPlayfitPick,
}: TasteMobileProps) {
  return (
    <div className="flex flex-col gap-6 md:hidden">
      {subView === "menu" && (
        <div className="flex flex-col gap-4">
          {/* Profile Summary Card */}
          <div className="rounded-2xl border border-border bg-card p-4 relative overflow-hidden">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-accent flex items-center gap-1.5">
              <ShieldCheck className="size-3.5" />
              Profile Summary
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {model.positiveCount > model.negativeCount
                ? "Playfit leans toward your favorites, but still needs more signals to sharpen the edge cases."
                : "Playfit is still balancing your likes and misses; a few more decisions will make the next pick steadier."}
            </p>
          </div>

          {/* Stats Summary Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-border bg-card p-3.5 text-center shadow-sm">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Preferences
              </p>
              <strong className="mt-1 block font-mono text-xl font-black text-foreground">
                {model.evidenceCount}
              </strong>
            </div>
            <div className="rounded-2xl border border-border bg-card p-3.5 text-center shadow-sm">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-positive">
                Liked
              </p>
              <strong className="mt-1 block font-mono text-xl font-black text-positive">
                {model.positiveCount}
              </strong>
            </div>
            <div className="rounded-2xl border border-border bg-card p-3.5 text-center shadow-sm">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-negative">
                Avoided
              </p>
              <strong className="mt-1 block font-mono text-xl font-black text-negative">
                {model.negativeCount}
              </strong>
            </div>
          </div>

          {/* Menu list */}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setSubView("map")}
              className="w-full flex items-center justify-between p-4 bg-card border border-border rounded-2xl hover:border-border/80 transition-all text-left cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="size-10 rounded-xl bg-secondary/60 flex items-center justify-center text-muted-foreground">
                  <Waves className="size-5 text-accent" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-extrabold text-foreground">
                    Interactive Affinity Map
                  </span>
                  <span className="text-xs text-muted-foreground mt-0.5">
                    Visual graph of your gaming traits
                  </span>
                </div>
              </div>
              <ChevronRight className="size-4 text-muted-foreground/60" />
            </button>

            <button
              type="button"
              onClick={() => setSubView("list")}
              className="w-full flex items-center justify-between p-4 bg-card border border-border rounded-2xl hover:border-border/80 transition-all text-left cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="size-10 rounded-xl bg-secondary/60 flex items-center justify-center text-muted-foreground">
                  <Layers className="size-5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-extrabold text-foreground">Gaming Traits List</span>
                  <span className="text-xs text-muted-foreground mt-0.5">
                    Liked and skipped styles list
                  </span>
                </div>
              </div>
              <ChevronRight className="size-4 text-muted-foreground/60" />
            </button>

            <button
              type="button"
              onClick={() => setSubView("activity")}
              className="w-full flex items-center justify-between p-4 bg-card border border-border rounded-2xl hover:border-border/80 transition-all text-left cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="size-10 rounded-xl bg-secondary/60 flex items-center justify-center text-muted-foreground">
                  <History className="size-5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-extrabold text-foreground">
                    Decisions & Activity
                  </span>
                  <span className="text-xs text-muted-foreground mt-0.5">
                    Review {historyAndActivityEntries.length} ratings and active picks
                  </span>
                </div>
              </div>
              <ChevronRight className="size-4 text-muted-foreground/60" />
            </button>
          </div>
        </div>
      )}

      {subView === "map" && (
        <div className="flex flex-col gap-4">
          <TasteMapVisualizer
            gamesById={gamesById}
            gameStates={gameStates}
            recommendations={recs}
          />
        </div>
      )}

      {subView === "list" && (
        <div className="flex flex-col gap-4">
          <TasteMap traits={model.mapTraits} />
        </div>
      )}

      {subView === "activity" && (
        <div className="flex flex-col gap-4">
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
        </div>
      )}
    </div>
  );
}
