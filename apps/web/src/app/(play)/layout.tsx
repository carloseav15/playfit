import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { fetchPlatforms } from "@/lib/supabase/platforms";
import { PlayLayoutClient } from "./layout-client";

export default async function PlayLayout({ children }: { children: React.ReactNode }) {
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

  return (
    <PlayLayoutClient platforms={platformsResult.platforms ?? []}>{children}</PlayLayoutClient>
  );
}
