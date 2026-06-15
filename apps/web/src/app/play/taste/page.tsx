import type { Metadata } from "next";
import { TastePageClient } from "@/components/playfit-mvp/taste-page-client";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { fetchPlatforms } from "@/lib/supabase/platforms";

export const metadata: Metadata = {
  title: "Your Taste",
  description: "See what Playfit is learning from your decisions.",
};

export default async function TastePage() {
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
            <CardTitle>Your Taste could not load</CardTitle>
            <CardDescription>{platformsResult.error}</CardDescription>
          </CardHeader>
        </Card>
      </Container>
    );
  }

  return <TastePageClient platforms={platformsResult.platforms ?? []} />;
}
