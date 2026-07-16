"use client";

import type { ProductPlatformOption, SeedGame } from "@playfit/core/types";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DesktopAppNav } from "@/components/playfit/desktop-app-nav";
import { MobileBottomNav } from "@/components/playfit/mobile-bottom-nav";
import { SearchResultRow, SearchStatusPanel } from "@/components/playfit/search-result-row";
import { useGameSearch } from "@/components/playfit/use-game-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GenreOption } from "@/lib/games-db";
import { SearchFilterBar } from "./search-filter-bar";

const PAGE_SIZE = 24;

export function SearchPageClient({
  platforms,
  genres,
  initialQuery,
  initialFamily,
  initialGenre,
}: {
  platforms: ProductPlatformOption[];
  genres: GenreOption[];
  initialQuery: string;
  initialFamily: string | null;
  initialGenre: string | null;
}) {
  const router = useRouter();

  const [query, setQuery] = useState(initialQuery);
  const [family, setFamily] = useState<string | null>(initialFamily);
  const [genre, setGenre] = useState<string | null>(initialGenre);
  const [page, setPage] = useState(1);
  const [accumulated, setAccumulated] = useState<SeedGame[]>([]);

  const platformIds = family
    ? platforms.filter((p) => p.family === family).map((p) => p.platformId)
    : [];

  const { results, total, pending, error, resolvedPage } = useGameSearch({
    query,
    filters: { platform: platformIds, genre: genre ?? undefined },
    page,
    pageSize: PAGE_SIZE,
  });

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
    router.replace(qs ? `/search?${qs}` : "/search", { scroll: false });
  }, [query, family, genre, router]);

  useEffect(() => {
    // resolvedPage guards against a stale prior-page `results` array: when `page`
    // just changed, this effect can re-fire (page is one of its deps) before
    // useGameSearch's own effect has actually refetched -- resolvedPage only
    // updates once real data for the requested page has landed.
    if (pending || resolvedPage !== page) return;
    setAccumulated((prev) => {
      if (page === 1) return results;
      const seen = new Set(prev.map((game) => game.gameId));
      return [...prev, ...results.filter((game) => !seen.has(game.gameId))];
    });
  }, [results, page, pending, resolvedPage]);

  const hasMore = accumulated.length < total;

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

      <div className="mx-auto grid w-[min(980px,calc(100%-2rem))] gap-8 py-10 md:py-16">
        <div className="grid gap-2">
          <h1 className="font-display text-3xl font-black tracking-tight md:text-5xl">
            Search the catalog
          </h1>
          <p className="text-muted-foreground">
            Browse every game in Playfit's library by title, platform, or genre.
          </p>
        </div>

        <label htmlFor="search-query" className="sr-only">
          Search by title
        </label>
        <Input
          id="search-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title..."
          className="text-base"
        />

        <SearchFilterBar
          platforms={platforms}
          genres={genres}
          selectedFamily={family}
          selectedGenre={genre}
          onFamilyChange={setFamily}
          onGenreChange={setGenre}
        />

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

        {accumulated.length === 0 && (
          <SearchStatusPanel pending={pending} error={error} catalogEmpty={false} hasQuery />
        )}

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
      <MobileBottomNav />
    </main>
  );
}
