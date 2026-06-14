import type { Metadata } from "next";
import { PlayPageClient } from "@/components/playfit-mvp/play-page-client";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { fetchPlatforms } from "@/lib/supabase/platforms";

export const metadata: Metadata = {
  title: "Play Next",
  description: "Find what to play next with Playfit.",
};

export default async function PlayPage() {
  const platformsResult = await fetchPlatforms()
    .then((platforms) => ({ platforms, error: null }))
    .catch((error: unknown) => ({
      platforms: null,
      error: error instanceof Error ? error.message : "The catalog connection failed.",
    }));

  if (platformsResult.error) {
    return (
      <Container as="main" size="sm" className="grid gap-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Play Next could not load</CardTitle>
            <CardDescription>{platformsResult.error}</CardDescription>
          </CardHeader>
        </Card>
      </Container>
    );
  }

  return <PlayPageClient platforms={platformsResult.platforms ?? []} />;
}
