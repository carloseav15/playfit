"use client";

import type {
  ProductDecisionFeedback,
  ProductGameState,
  ProductTasteMapTrait,
  ProductTasteModel,
  ProductTasteSignalSource,
  RankedSeedGame,
  SeedGame,
} from "@playfit/core/types";
import { Dna, History, Network } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { TasteProfileSummary } from "../taste/taste-profile-summary";
import { type TasteSection, tasteSectionHref } from "../taste/taste-sections";
import { TasteStats } from "../taste/taste-stats";
import { TasteHistory, TasteMap } from "../taste-components";
import { TasteMapVisualizer } from "../taste-map-visualizer";
import type { HistoryOrActivityEntry } from "../taste-model";

const sectionItems: {
  section: TasteSection;
  label: string;
  Icon: ComponentType<{ className?: string }>;
}[] = [
  { section: "dna", label: "Taste DNA", Icon: Dna },
  { section: "map", label: "Visual map", Icon: Network },
  { section: "activity", label: "Activity", Icon: History },
];

interface TasteDesktopProps {
  section: TasteSection;
  model: ProductTasteModel;
  historyAndActivityEntries: HistoryOrActivityEntry[];
  gamesById: Map<string, SeedGame>;
  gameStates: Record<string, ProductGameState>;
  recs: RankedSeedGame[];
  changingId: string | null;
  setChangingId: (id: string | null) => void;
  applyDecisionFeedback: (gameId: string, feedback: ProductDecisionFeedback) => void;
  setPlayfitPick: (gameId: string, pick: boolean) => void;
  removeTasteSignal: (gameId: string, source: ProductTasteSignalSource) => void;
  traitFilter: { id: string; label: string } | null;
  onSelectTrait: (trait: ProductTasteMapTrait) => void;
  onClearTraitFilter: () => void;
}

export function TasteDesktop({
  section,
  model,
  historyAndActivityEntries,
  gamesById,
  gameStates,
  recs,
  changingId,
  setChangingId,
  applyDecisionFeedback,
  setPlayfitPick,
  removeTasteSignal,
  traitFilter,
  onSelectTrait,
  onClearTraitFilter,
}: TasteDesktopProps) {
  const router = useRouter();
  const summaries: Record<TasteSection, string> = {
    dna: `${model.mapTraits.length} ${model.mapTraits.length === 1 ? "trait" : "traits"}`,
    map: "Explore your affinity map",
    activity: `${historyAndActivityEntries.length} ${historyAndActivityEntries.length === 1 ? "entry" : "entries"}`,
  };

  return (
    <div className="hidden gap-8 md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="Taste sections" className="self-start md:sticky md:top-24">
        <ul className="grid gap-1">
          {sectionItems.map(({ section: item, label, Icon }) => {
            const active = item === section;
            return (
              <li key={item}>
                <Link
                  href={tasteSectionHref(item)}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-start gap-2.5 rounded-xl px-3 py-2 no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                >
                  <Icon className="mt-0.5 size-4 shrink-0" />
                  <span className="grid min-w-0">
                    <span className="text-sm font-bold">{label}</span>
                    <span className="truncate text-xs font-normal text-muted-foreground">
                      {summaries[item]}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 px-3 text-[11px] leading-relaxed text-muted-foreground">
          Based on {model.evidenceCount} preferences
        </p>
      </nav>

      <div className="flex min-w-0 flex-col gap-6 pb-4">
        {section === "dna" ? (
          <>
            <TasteProfileSummary model={model} className="grid" />
            <TasteStats model={model} />
            <TasteMap
              traits={model.mapTraits}
              onSelectTrait={(trait) => {
                onSelectTrait(trait);
                router.push(tasteSectionHref("activity"), { scroll: false });
              }}
            />
          </>
        ) : null}

        {section === "map" ? (
          <TasteMapVisualizer
            gamesById={gamesById}
            gameStates={gameStates}
            recommendations={recs}
          />
        ) : null}

        {section === "activity" ? (
          <TasteHistory
            entries={historyAndActivityEntries}
            changingId={changingId}
            onToggleChange={(gameId) => setChangingId(changingId === gameId ? null : gameId)}
            onChange={(entry, feedback) => {
              applyDecisionFeedback(entry.gameId, feedback);
              setChangingId(null);
            }}
            onRemove={(entry) => {
              if (entry.decision === "picks") {
                setPlayfitPick(entry.gameId, false);
              } else if (entry.source !== "active_state") {
                removeTasteSignal(entry.gameId, entry.source);
              }
              setChangingId(null);
            }}
            traitFilter={traitFilter}
            onClearTraitFilter={onClearTraitFilter}
          />
        ) : null}
      </div>
    </div>
  );
}
