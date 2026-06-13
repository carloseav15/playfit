import Link from "next/link";
import { PlayfitRouteProvider } from "@/components/playfit/playfit-route-provider";
import { Button } from "@/components/ui/button";
import { fetchPlatforms } from "@/lib/supabase/platforms";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const platformsResult = await fetchPlatforms()
    .then((platforms) => ({ platforms, error: null }))
    .catch((error: unknown) => ({
      platforms: null,
      error: error instanceof Error ? error.message : "The catalog connection failed.",
    }));

  if (platformsResult.error) {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <div className="grid max-w-sm gap-5">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Playfit · App
          </p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">
            Playfit could not load
          </h1>
          <p className="text-muted-foreground">{platformsResult.error}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button type="button" asChild>
              <Link href="/app">Try again</Link>
            </Button>
            <Button type="button" variant="secondary" asChild>
              <Link href="/">Go home</Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const platforms = platformsResult.platforms ?? [];
  return <PlayfitRouteProvider platforms={platforms}>{children}</PlayfitRouteProvider>;
}
