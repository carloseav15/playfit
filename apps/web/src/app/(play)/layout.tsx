import { headers } from "next/headers";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { getErrorMessage } from "@/lib/api-errors";
import { isReturningVisitor } from "@/lib/returning-visitor";
import { fetchPlatforms } from "@/lib/supabase/platforms";
import { PlayLayoutClient } from "./layout-client";

export default async function PlayLayout({ children }: { children: React.ReactNode }) {
  // Cold visitors hitting "/" get the marketing landing page (rendered by page.tsx as
  // `children`) with no app shell around it — mounting PlayfitProvider here would trigger
  // an anonymous Supabase session before they've ever seen the product. Every other route
  // under (play) (/picks, /taste, /settings, /game/[id]) has no such fallback and genuinely
  // needs the provider to render at all, regardless of cookie state — skipping it there
  // crashes with "usePlayfit must be used inside PlayfitProvider."
  const pathname = (await headers()).get("x-pathname");
  const isRootLanding = pathname === "/" && !(await isReturningVisitor());
  if (isRootLanding) {
    return <>{children}</>;
  }

  const platformsResult = await fetchPlatforms()
    .then((platforms) => ({ platforms, error: null }))
    .catch((error: unknown) => ({
      platforms: null,
      error: getErrorMessage(error, "The catalog connection failed."),
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
