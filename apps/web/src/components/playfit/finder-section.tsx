"use client";

import { scoreSeedGame } from "@playfit/core/domain";
import { motion } from "motion/react";
import { useDeferredValue, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CoverArt } from "./cover-art";
import { usePlayfit } from "./playfit-context";
import { decisionLabel, decisionTone, formatGameDescriptor } from "./product-utils";
import { SectionHead } from "./section-head";

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04 },
  },
};

const cardItemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

export function FinderSection() {
  const { state, ui, setUi, openDossier, searchGames } = usePlayfit();
  const deferredFinderQuery = useDeferredValue(ui.finderQuery);
  const hasQuery = ui.finderQuery.trim().length > 0;
  const isSearchStale = deferredFinderQuery !== ui.finderQuery;
  const results = useMemo(() => {
    if (!hasQuery) return [];
    return searchGames(deferredFinderQuery);
  }, [deferredFinderQuery, hasQuery, searchGames]);

  return (
    <section>
      <SectionHead
        eyebrow="Discover"
        title="Find a game worth your time"
        copy="Search by title or series, then open the read before adding it."
      />
      <Input
        type="search"
        aria-label="Search the catalog"
        value={ui.finderQuery}
        onChange={(event) => setUi((current) => ({ ...current, finderQuery: event.target.value }))}
        placeholder="Discover a game or series"
        className="mb-5 max-w-xl"
      />
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className={cn("grid gap-3 transition-opacity duration-150", isSearchStale && "opacity-50")}
        role="status"
        aria-live="polite"
        aria-busy={isSearchStale}
      >
        {!hasQuery ? (
          <motion.div variants={cardItemVariants}>
            <Card>
              <CardHeader>
                <CardTitle>Discover something new</CardTitle>
                <CardDescription>
                  Search for a title and Playfit will show a read when there is enough signal.
                </CardDescription>
              </CardHeader>
            </Card>
          </motion.div>
        ) : results.length === 0 ? (
          <motion.div variants={cardItemVariants}>
            <Card>
              <CardHeader>
                <CardTitle>Not in the catalog?</CardTitle>
                <CardDescription>Try a different title or check back later.</CardDescription>
              </CardHeader>
            </Card>
          </motion.div>
        ) : (
          results.map((game) => {
            const ranked = state.user.profile
              ? scoreSeedGame(game, state, state.user.profile)
              : null;
            return (
              <motion.div key={game.gameId} variants={cardItemVariants}>
                <button
                  type="button"
                  aria-label={`Open ${game.title} dossier`}
                  className="grid w-full grid-cols-[56px_1fr_auto] items-center gap-4 rounded-md border border-border bg-card p-3 text-left transition-all duration-150 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"
                  onClick={() => openDossier(game.gameId)}
                >
                  <CoverArt game={game} className="aspect-[2/3]" />
                  <span>
                    <strong>{game.title}</strong>
                    <span className="block text-sm text-muted-foreground">
                      {formatGameDescriptor(game)}
                    </span>
                  </span>
                  {ranked ? (
                    <Badge variant={decisionTone(ranked)}>{decisionLabel(ranked)}</Badge>
                  ) : (
                    <Badge variant="secondary">Setup needed</Badge>
                  )}
                </button>
              </motion.div>
            );
          })
        )}
      </motion.div>
    </section>
  );
}
