import type { Metadata } from "next";
import { SearchPageClient } from "@/components/playfit/search/search-page-client";
import { getDistinctGenres } from "@/lib/games-db";
import { fetchPlatforms } from "@/lib/supabase/platforms";
import { createAnonClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Search the Catalog — Playfit",
  description: "Browse and search the full Playfit game catalog by title, platform, or genre.",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; family?: string; genre?: string }>;
}) {
  const params = await searchParams;
  const supabase = createAnonClient();

  const [platforms, genres] = await Promise.all([fetchPlatforms(), getDistinctGenres(supabase)]);

  return (
    <SearchPageClient
      platforms={platforms}
      genres={genres}
      initialQuery={params.q ?? ""}
      initialFamily={params.family ?? null}
      initialGenre={params.genre ?? null}
    />
  );
}
