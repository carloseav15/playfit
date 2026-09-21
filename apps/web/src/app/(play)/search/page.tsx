import type { Metadata } from "next";
import { SEARCH_DESCRIPTION } from "@/components/playfit/search/search-config";
import { SearchRouteClient } from "@/components/playfit/search/search-route-client";

export const metadata: Metadata = {
  title: "Search the Catalog",
  description: SEARCH_DESCRIPTION,
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
