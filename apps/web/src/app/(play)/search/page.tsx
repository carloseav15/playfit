import type { Metadata } from "next";
import { SearchRouteClient } from "@/components/playfit/search/search-route-client";

export const metadata: Metadata = {
  title: "Search the Catalog",
  description: "Browse and search the full Playfit game catalog by title, platform, or genre.",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; family?: string; genre?: string }>;
}) {
  const params = await searchParams;

  return (
    <SearchRouteClient
      initialQuery={params.q ?? ""}
      initialFamily={params.family ?? null}
      initialGenre={params.genre ?? null}
    />
  );
}
