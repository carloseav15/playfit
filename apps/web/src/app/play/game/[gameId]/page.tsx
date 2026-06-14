import type { Metadata } from "next";
import { PlayDossierClient } from "@/components/playfit-mvp/play-dossier-client";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { fetchPlatforms } from "@/lib/supabase/platforms";

export const metadata: Metadata = {
  title: "Why this game",
};

export default async function Page(props: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await props.params;
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
            <CardTitle>Game details could not load</CardTitle>
            <CardDescription>{platformsResult.error}</CardDescription>
          </CardHeader>
        </Card>
      </Container>
    );
  }

  return <PlayDossierClient platforms={platformsResult.platforms ?? []} gameId={gameId} />;
}
