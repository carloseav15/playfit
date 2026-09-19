"use client";

import type { ProductPlatformOption } from "@playfit/core/types";
import { useEffect, useState } from "react";
import { z } from "zod";
import { platformsResponseSchema } from "@/lib/api-contracts";
import type { GenreOption } from "@/lib/games-db";
import { SearchPageClient } from "./search-page-client";

const filtersSchema = platformsResponseSchema.extend({
  genres: z.array(z.object({ genreId: z.string(), name: z.string() })),
});
let cachedFilters: {
  platforms: ProductPlatformOption[];
  genres: GenreOption[];
  expires: number;
} | null = null;

export function SearchRouteClient(props: {
  initialQuery: string;
  initialFamily: string | null;
  initialGenre: string | null;
}) {
  const [filters, setFilters] = useState(() =>
    cachedFilters && cachedFilters.expires > Date.now() ? cachedFilters : null,
  );
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (filters) return;
    const controller = new AbortController();
    let cancelled = false;
    const timeout = setTimeout(() => controller.abort(), 8000);
    setError(false);
    void fetch("/api/search/filters", {
      signal: controller.signal,
      cache: attempt ? "reload" : "default",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Filters unavailable");
        return filtersSchema.parse(await response.json());
      })
      .then((data) => {
        if (cancelled) return;
        cachedFilters = {
          platforms: data.platforms.map((p) => ({
            ...p,
            family: p.family ?? "other",
            kind: (p.kind ?? "other") as ProductPlatformOption["kind"],
            sortOrder: p.sortOrder ?? 0,
          })),
          genres: data.genres,
          expires: Date.now() + 300_000,
        };
        setFilters(cachedFilters);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [filters, attempt]);
  return (
    <SearchPageClient
      {...props}
      platforms={filters?.platforms ?? []}
      genres={filters?.genres ?? []}
      filtersReady={!!filters}
      filtersError={error}
      onRetryFilters={() => setAttempt((value) => value + 1)}
    />
  );
}
