"use client";

import type { ProductPlatformOption, SeedGame } from "@playfit/core/types";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useContext, useEffect, useRef, useState } from "react";
import { DesktopAppNav } from "@/components/playfit/desktop-app-nav";
import { MobileBottomNav } from "@/components/playfit/mobile-bottom-nav";
import { SearchResultRow, SearchStatusPanel } from "@/components/playfit/search-result-row";
import { useGameSearch } from "@/components/playfit/use-game-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GenreOption } from "@/lib/games-db";
import { PlayfitStateContext } from "../playfit-context";
import { SEARCH_FILTERS_ENABLED, SEARCH_SUBTITLE } from "./search-config";
import { SearchFilterBar } from "./search-filter-bar";

const PAGE_SIZE = 24;

export function SearchPageClient({
  platforms,
  genres,
  initialQuery,
  initialFamily,
  initialGenre,
  filtersReady = true,
  filtersError = false,
  onRetryFilters,
}: {
  filtersReady?: boolean;
  filtersError?: boolean;
  onRetryFilters?: () => void;
  platforms: ProductPlatformOption[];
  genres: GenreOption[];
  initialQuery: string;
  initialFamily: string | null;
  initialGenre: string | null;
}) {
  const router = useRouter();
  const [interactive, setInteractive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setInteractive(true), []);
  useEffect(() => {
    const input = inputRef.current;
    if (!interactive || !input) return;
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }, [interactive]);
  const appState = useContext(PlayfitStateContext);
  const hasAppNavigation = !!appState?.state.user.onboardingCompletedAt;

  const [query, setQuery] = useState(initialQuery);
  const [family, setFamily] = useState<string | null>(
    SEARCH_FILTERS_ENABLED ? initialFamily : null,
  );
  const [genre, setGenre] = useState<string | null>(SEARCH_FILTERS_ENABLED ? initialGenre : null);
  const [page, setPage] = useState(1);
  const [accumulated, setAccumulated] = useState<SeedGame[]>([]);

  const platformIds = family
    ? platforms.filter((p) => p.family === family).map((p) => p.platformId)
    : [];

  const { results, total, pending, error, resolvedKey, retry } = useGameSearch({
    query,
    enabled: !family || (filtersReady && platformIds.length > 0),
    filters: { platform: platformIds, genre: genre ?? undefined },
    page,
    pageSize: PAGE_SIZE,
  });
  const currentKey = `${query.trim()}|${platformIds.join(",")}|${genre ?? ""}|${page}`;

  // Filter/query changes reset paging and reflect in the URL so a search is
  // shareable/bookmarkable; "Load more" (page increments) deliberately does not
  // sync back so the current browsing position stays local to the page.
  useEffect(() => {
    setPage(1);
    setAccumulated([]);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (family) params.set("family", family);
    if (genre) params.set("genre", genre);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/search?${qs}` : "/search");
  }, [query, family, genre]);

  useEffect(() => {
    // resolvedKey guards against a stale `results` array answering a *different*
    // query/filter/page combination than the one currently selected. Checking
    // resolvedPage alone isn't enough: this effect and useGameSearch's own effect
    // both belong to this component, so on a query/filter change they can run in
    // the same commit, with this effect reading `results`/`pending` from *before*
    // useGameSearch's state update lands -- e.g. `page` stays 1 across two
    // different queries, resolvedPage still equals page, and this effect would
    // otherwise briefly re-adopt the previous query's (already-cleared)
    // `accumulated` from stale `results`. Comparing the full resolved identity
    // closes that gap.
    if (pending || resolvedKey !== currentKey) return;
    setAccumulated((prev) => {
      if (page === 1) return results;
      const seen = new Set(prev.map((game) => game.gameId));
      return [...prev, ...results.filter((game) => !seen.has(game.gameId))];
    });
  }, [results, page, pending, resolvedKey, currentKey]);

  const hasMore = accumulated.length < total;
  const hasQuery = query.trim().length > 0 || !!family || !!genre;

  function selectGame(gameId: string) {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (family) params.set("family", family);
    if (genre) params.set("genre", genre);
    const queryString = params.toString();
    const returnTo = queryString ? `/search?${queryString}` : "/search";

    router.push(`/game/${gameId}?returnTo=${encodeURIComponent(returnTo)}`);
  }

  return (
    <main className="min-h-screen pb-20 md:pb-0">
      {!hasAppNavigation && (
        <header className="sticky top-0 z-40 shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-xl">
          <div className="relative mx-auto flex min-h-16 w-full max-w-5xl items-center justify-between gap-5 px-6">
            <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center md:hidden">
              <span className="font-display text-base font-black tracking-tight text-foreground">
                Search
              </span>
            </div>
            <Link href="/" className="hidden items-center gap-2.5 no-underline md:flex">
              <Image
                src="/playfit_logo_light.png"
                alt="Playfit Logo"
                width={28}
                height={28}
                className="object-contain dark:hidden"
                priority
              />
              <Image
                src="/playfit_logo_dark.png"
                alt="Playfit Logo"
                width={28}
                height={28}
                className="hidden object-contain dark:block"
                priority
              />
              <span className="grid leading-tight">
                <strong className="font-display text-sm tracking-tight font-black text-foreground">
                  Playfit
                </strong>
                <span className="text-[10px] text-muted-foreground">
                  Game decisions you can trust
                </span>
              </span>
            </Link>
            <DesktopAppNav />
          </div>
        </header>
      )}

      <div className="mx-auto grid w-[min(980px,calc(100%-2rem))] gap-8 py-10 md:py-16">
        <div className="grid gap-2">
          <h1 className="font-display text-3xl font-black tracking-tight md:text-5xl">
            Search the catalog
          </h1>
          <p className="text-muted-foreground">{SEARCH_SUBTITLE}</p>
        </div>

        <label htmlFor="search-query" className="sr-only">
          Search by title
        </label>
        <Input
          ref={inputRef}
          id="search-query"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={!interactive}
          placeholder="Search by title..."
          className="text-base border border-border bg-card"
        />

        {SEARCH_FILTERS_ENABLED ? (
          <>
            {!filtersReady ? (
              <div role="status" className="flex items-center gap-3 text-sm text-muted-foreground">
                {filtersError
                  ? "Filters are unavailable. You can still search by title."
                  : "Loading filters…"}
                {filtersError && (
                  <Button type="button" variant="secondary" size="sm" onClick={onRetryFilters}>
                    Retry filters
                  </Button>
                )}
              </div>
            ) : null}
            {family && (!filtersReady || platformIds.length === 0) ? (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>
                  {filtersReady
                    ? "This platform filter is unavailable."
                    : "The selected platform filter needs catalog metadata."}
                </span>
                <Button type="button" size="sm" variant="secondary" onClick={() => setFamily(null)}>
                  Clear platform filter
                </Button>
              </div>
            ) : null}
            <SearchFilterBar
              platforms={platforms}
              genres={genres}
              selectedFamily={family}
              selectedGenre={genre}
              onFamilyChange={setFamily}
              onGenreChange={setGenre}
            />
          </>
        ) : null}

        {accumulated.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accumulated.map((game) => (
              <SearchResultRow
                key={game.gameId}
                game={game}
                onSelect={() => selectGame(game.gameId)}
              />
            ))}
          </div>
        )}

        {accumulated.length === 0 && (!family || (filtersReady && platformIds.length > 0)) && (
          <SearchStatusPanel
            pending={pending || (!!family && !filtersReady && !filtersError)}
            error={error}
            catalogEmpty={false}
            hasQuery={hasQuery}
          />
        )}

        {error ? (
          <Button type="button" variant="secondary" disabled={pending} onClick={retry}>
            {pending ? "Retrying…" : "Retry search"}
          </Button>
        ) : null}

        {hasMore && (
          <Button
            type="button"
            variant="secondary"
            className="mx-auto"
            disabled={pending}
            onClick={() => setPage((p) => p + 1)}
          >
            {pending ? "Loading..." : "Load more"}
          </Button>
        )}
      </div>
      {!hasAppNavigation && <MobileBottomNav />}
    </main>
  );
}
