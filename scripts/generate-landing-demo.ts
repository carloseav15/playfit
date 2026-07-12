/**
 * One-time precompute for the marketing landing page's interactive demo section.
 *
 * Generates a real recommendation result for a fixed taste profile (loved: Final Fantasy
 * XII, Kingdom Hearts II, Donkey Kong Country 2 / disliked: Marvel Ultimate Alliance 3)
 * using the exact same domain logic and RPC the live app uses, then writes a curated subset
 * of the results as committed static data so the landing page never hits the DB at request
 * time.
 *
 * The result set (PINNED_RESULT_IDS) is picked by hand from the RPC's real output, same as
 * the loved/disliked anchors — verified to have real public (IGDB) cover URLs, not the
 * catalog's occasional localhost-only storage covers, and chosen for a recognizable spread.
 * The match scores shown are still pulled live from the real RPC call for those exact IDs,
 * never fabricated — only *which* games appear is curated, not their numbers.
 *
 * Rerun with: npx tsx scripts/generate-landing-demo.ts
 * Rerun whenever the catalog or scoring RPC changes meaningfully enough that the demo
 * should be refreshed — if a pinned ID's cover breaks or a name in PINNED_RESULT_IDS
 * disappears from the catalog, the script throws rather than silently swapping it out.
 */
import { createClient } from "@supabase/supabase-js";
import { buildDislikedTagsFromProfile, buildFallbackProfile, buildLikedTagsFromProfile } from "@playfit/core/domain";
import type { ProductOnboardingDraft, RankedSeedGame, SeedGame } from "@playfit/core/types";
import { fetchGamesByIds, mapRowsToSeedGames } from "../apps/web/src/lib/games-db";

const LOVED_IDS = ["final_fantasy_xii", "kingdom_hearts_ii", "donkey_kong_country_2"];
const DISLIKED_IDS = ["marvel_ultimate_alliance_3"];

// Curated from the RPC's real nextUp output for this taste profile — confirmed real IGDB
// cover URLs and a recognizable, non-redundant spread (see script docblock above).
const PINNED_RESULT_IDS = [
  "kingdom_hearts",
  "final_fantasy_vii_remake",
  "kingdom_hearts_iii",
  "metaphor_refantazio",
  "xenoblade_chronicles_2",
  "clair_obscur_expedition_33",
];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "local-dev-anon-key",
  { db: { schema: "games_library" }, auth: { persistSession: false } },
);

async function main() {
  const gamesResult = await fetchGamesByIds(supabase, [...LOVED_IDS, ...DISLIKED_IDS]);
  if (!gamesResult.ok || gamesResult.rows.length === 0) {
    throw new Error(`Failed to fetch anchor games: ${gamesResult.errors.join(", ")}`);
  }

  const seedGames = await mapRowsToSeedGames(supabase, gamesResult.rows);
  const gamesById = new Map<string, SeedGame>(seedGames.map((g) => [g.gameId, g]));

  for (const id of [...LOVED_IDS, ...DISLIKED_IDS]) {
    if (!gamesById.has(id)) throw new Error(`Anchor game not found in catalog: ${id}`);
  }

  const draft: ProductOnboardingDraft = {
    step: "dislikes",
    platforms: [],
    likedGameIds: LOVED_IDS,
    dislikedGameIds: DISLIKED_IDS,
  };

  const profile = buildFallbackProfile(draft, gamesById);
  const likedTags = buildLikedTagsFromProfile(profile);
  const dislikedTags = buildDislikedTagsFromProfile(profile);

  const { data, error } = await supabase.rpc("score_today_recommendations", {
    p_liked_tags: likedTags,
    p_disliked_tags: dislikedTags,
    p_liked_genres: profile.likedGenres,
    p_avoided_genres: profile.avoidedGenres,
    p_rated_count: profile.ratedCount,
    p_accessible_platform_ids: [],
    p_onboarding_liked_ids: draft.likedGameIds,
    p_onboarding_disliked_ids: draft.dislikedGameIds,
    p_game_states: {},
    p_skip_buckets: [],
  });

  if (error) throw new Error(`RPC failed: ${error.message}`);

  const allNextUp = (data as { nextUp?: RankedSeedGame[] }).nextUp ?? [];
  if (allNextUp.length === 0) throw new Error("RPC returned no nextUp results — aborting.");

  const nextUpById = new Map(allNextUp.map((entry) => [entry.game.gameId, entry]));
  const pinned = PINNED_RESULT_IDS.map((id) => {
    const entry = nextUpById.get(id);
    if (!entry) {
      throw new Error(
        `Pinned result "${id}" is no longer in the RPC's nextUp output for this taste profile — ` +
          "pick a replacement from the real output and update PINNED_RESULT_IDS.",
      );
    }
    return entry;
  });

  // Sort by real match score, descending — the numbers are real, only the set is curated.
  const rawNextUp = [...pinned].sort((a, b) => b.affinityScore - a.affinityScore);

  // The RPC's jsonb output uses `null` for absent optional fields; SeedGame types them as
  // `string | undefined`. JSON.stringify drops `undefined` keys, so this normalizes shape
  // before serializing rather than emitting a literal that fails strict typecheck.
  const nextUp = rawNextUp.map((entry) => ({
    ...entry,
    game: { ...entry.game, externalCoverUrl: entry.game.externalCoverUrl ?? undefined },
  }));

  console.log(
    "Demo result titles (desc by match):",
    nextUp.map((entry) => `${entry.game.title} (${entry.affinityScore})`),
  );

  const lovedGames = LOVED_IDS.map((id) => gamesById.get(id) as SeedGame).map((game) => ({
    ...game,
    externalCoverUrl: game.externalCoverUrl ?? undefined,
  }));
  const dislikedGames = DISLIKED_IDS.map((id) => gamesById.get(id) as SeedGame).map((game) => ({
    ...game,
    externalCoverUrl: game.externalCoverUrl ?? undefined,
  }));

  const output = `// Generated by scripts/generate-landing-demo.ts — do not edit by hand.
// Rerun the script to refresh if the catalog or scoring RPC changes meaningfully.
import type { RankedSeedGame, SeedGame } from "@playfit/core/types";

export const landingDemoTaste = {
  loved: ${JSON.stringify(lovedGames, null, 2)} as unknown as SeedGame[],
  disliked: ${JSON.stringify(dislikedGames, null, 2)} as unknown as SeedGame[],
};

// The RPC's jsonb payload is a reduced projection of SeedGame (only the fields the
// scoring/UI path actually reads) — the app itself does the same blind cast rather than
// asserting the full shape (see apps/web/src/app/api/recommendations/shared.ts:97).
export const landingDemoResults = ${JSON.stringify(nextUp, null, 2)} as unknown as RankedSeedGame[];
`;

  const outPath = new URL(
    "../apps/web/src/components/playfit/landing/demo-data.ts",
    import.meta.url,
  );
  const fs = await import("node:fs/promises");
  await fs.mkdir(new URL("../apps/web/src/components/playfit/landing/", import.meta.url), {
    recursive: true,
  });
  await fs.writeFile(outPath, output, "utf-8");

  console.log(`Wrote ${nextUp.length} demo entries to ${outPath.pathname}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
