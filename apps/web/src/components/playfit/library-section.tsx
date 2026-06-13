"use client";

import type { SeedGame } from "@playfit/core/types";
import { motion } from "motion/react";
import { useMemo } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tab, TabGroup } from "@/components/ui/tabs";
import { CoverArt } from "./cover-art";
import { usePlayfit } from "./playfit-context";
import { statusOptions, statusPriority } from "./product-utils";
import { SectionHead } from "./section-head";
import { StarRating } from "./star-rating";

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04 },
  },
};

const fastContainerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.008 },
  },
};

const cardItemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

const tabs = [
  { key: "all" as const, label: "All" },
  { key: "backlog" as const, label: "Backlog" },
  { key: "wishlist" as const, label: "Wishlist" },
];

function StatusLabel({ status }: { status: string }) {
  const opt = statusOptions.find((s) => s.value === status);
  if (!opt) return null;
  return (
    <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
      {opt.label}
    </p>
  );
}

const sortOptions = [
  { value: "title" as const, label: "A-Z" },
  { value: "rating-desc" as const, label: "Rating (best first)" },
  { value: "rating-asc" as const, label: "Rating (worst first)" },
  { value: "status" as const, label: "Status (active first)" },
];

export function LibrarySection() {
  const { state, ui, setUi, openDossier, getSeedGame } = usePlayfit();

  const { allEntries, tabCounts, filtered } = useMemo(() => {
    const sorted = Object.values(state.user.gameStates).sort((a, b) => {
      switch (ui.librarySort) {
        case "rating-desc": {
          const ra = a.rating ?? -1;
          const rb = b.rating ?? -1;
          return rb - ra;
        }
        case "rating-asc": {
          const ra = a.rating ?? -1;
          const rb = b.rating ?? -1;
          return ra - rb;
        }
        case "status":
          return statusPriority(a.status) - statusPriority(b.status);
        default:
          return a.title.localeCompare(b.title);
      }
    });
    const searched = sorted.filter((entry) =>
      entry.title.toLowerCase().includes(ui.libraryQuery.toLowerCase()),
    );
    return {
      allEntries: sorted,
      tabCounts: {
        all: sorted.length,
        backlog: sorted.filter((e) => e.inBacklog).length,
        wishlist: sorted.filter((e) => e.inWishlist).length,
      },
      filtered:
        ui.libraryTab === "all"
          ? searched
          : searched.filter((e) => (ui.libraryTab === "backlog" ? e.inBacklog : e.inWishlist)),
    };
  }, [state.user.gameStates, ui.librarySort, ui.libraryQuery, ui.libraryTab]);

  return (
    <section>
      <SectionHead
        eyebrow="Library"
        title="My Games"
        copy="Your collection, quiet and organized."
      />
      <TabGroup className="mb-5">
        {tabs.map((tab) => (
          <Tab
            key={tab.key}
            variant={ui.libraryTab === tab.key ? "default" : "secondary"}
            aria-pressed={ui.libraryTab === tab.key}
            onClick={() => setUi((current) => ({ ...current, libraryTab: tab.key }))}
            count={tabCounts[tab.key]}
          >
            {tab.label}
          </Tab>
        ))}
      </TabGroup>
      <div className="mb-5 flex items-center gap-3">
        <Input
          type="search"
          aria-label="Search your games"
          value={ui.libraryQuery}
          onChange={(event) =>
            setUi((current) => ({ ...current, libraryQuery: event.target.value }))
          }
          placeholder="Search your games..."
          className="max-w-xl"
        />
        <Select
          value={ui.librarySort}
          onChange={(event) => {
            const knownSorts: readonly string[] = sortOptions.map((o) => o.value);
            if (!knownSorts.includes(event.target.value)) return;
            setUi((current) => ({
              ...current,
              librarySort: event.target.value as typeof ui.librarySort,
            }));
          }}
          className="w-48 shrink-0"
          aria-label="Sort by"
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>
      <motion.div
        variants={filtered.length > 50 ? fastContainerVariants : containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8"
        role="status"
        aria-live="polite"
      >
        {filtered.length === 0 ? (
          <Card className="col-span-full">
            <CardHeader>
              <CardTitle>
                {ui.libraryTab === "backlog"
                  ? "No games in backlog"
                  : ui.libraryTab === "wishlist"
                    ? "No games on wishlist"
                    : "No games yet"}
              </CardTitle>
              <CardDescription>
                {allEntries.length === 0
                  ? "Add favorites during setup, or save a title from Search."
                  : "Try another filter, sort, or search term."}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          filtered
            .map((entry) => ({ entry, game: getSeedGame(entry.gameId) }))
            .filter((item): item is { entry: (typeof filtered)[number]; game: SeedGame } =>
              Boolean(item.game),
            )
            .map(({ entry, game }) => (
              <motion.div key={entry.gameId} variants={cardItemVariants}>
                <button
                  type="button"
                  aria-label={`Open ${game.title} dossier`}
                  onClick={() => openDossier(entry.gameId)}
                  className="w-full overflow-hidden rounded-md border border-border transition-all duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <CoverArt game={game} className="aspect-[2/3] w-full" />
                  <div className="flex min-h-[18px] items-center justify-center px-1.5 pt-1">
                    {entry.rating != null && entry.rating > 0 ? (
                      <StarRating value={entry.rating} readOnly />
                    ) : null}
                  </div>
                  <div className="px-1.5 pb-1">
                    <p className="truncate text-[11px] font-medium leading-tight text-muted-foreground">
                      {game.title}
                    </p>
                    {entry.status ? <StatusLabel status={entry.status} /> : null}
                  </div>
                </button>
              </motion.div>
            ))
        )}
      </motion.div>
    </section>
  );
}
