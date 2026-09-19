import { getDistinctGenres } from "@/lib/games-db";
import { fetchPlatforms } from "@/lib/supabase/platforms";
import { createAnonClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const [platforms, genres] = await Promise.all([
      fetchPlatforms(),
      getDistinctGenres(createAnonClient()),
    ]);
    return Response.json(
      { platforms, genres },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  } catch {
    return Response.json({ error: "Search filters could not load." }, { status: 503 });
  }
}
