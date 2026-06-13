import { existsSync } from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const args = new Set(process.argv.slice(2));
const requireDb = args.has("--require-db");
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const publicRoot = path.join(process.cwd(), "apps", "web", "public");
const pageSize = 1000;

function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/\s*\[duplicate\]\s*/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function localCoverPath(coverUrl) {
  if (!coverUrl || coverUrl.startsWith("http")) return null;
  const normalized = coverUrl.startsWith("/") ? coverUrl : `/${coverUrl}`;
  if (!normalized.startsWith("/covers/games/")) {
    return { supported: false, normalized };
  }
  return {
    supported: true,
    normalized,
    filePath: path.join(publicRoot, normalized.slice(1)),
  };
}

async function loadGames() {
  if (!SUPABASE_SERVICE_KEY) {
    const message =
      "Skipping cover integrity check: SUPABASE_SERVICE_KEY is not available in this environment.";
    if (requireDb) {
      throw new Error(message);
    }
    console.error(message);
    return [];
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    db: { schema: "games_library" },
  });
  const games = [];
  let from = 0;
  let done = false;

  while (!done) {
    const { data, error } = await supabase
      .schema("games_library")
      .from("games")
      .select("game_id,title,cover_url,source_type")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Failed to load games: ${error.message}`);

    const batch = data ?? [];
    games.push(...batch);
    from += pageSize;
    done = batch.length < pageSize;
  }

  return games;
}

function analyze(games) {
  const missingLocalCovers = [];
  const unsupportedLocalCovers = [];
  const catalogTitles = new Map();

  for (const game of games) {
    const cover = localCoverPath(game.cover_url ?? "");
    if (cover && !cover.supported) {
      unsupportedLocalCovers.push({
        gameId: game.game_id,
        title: game.title,
        coverUrl: game.cover_url,
      });
    } else if (cover?.filePath && !existsSync(cover.filePath)) {
      missingLocalCovers.push({
        gameId: game.game_id,
        title: game.title,
        coverUrl: game.cover_url,
      });
    }

    if (game.source_type === "catalog") {
      const key = normalizeTitle(game.title);
      if (!key) continue;
      const group = catalogTitles.get(key) ?? [];
      group.push({ gameId: game.game_id, title: game.title });
      catalogTitles.set(key, group);
    }
  }

  const duplicateCatalogGroups = [...catalogTitles.values()]
    .filter((group) => group.length > 1)
    .sort((left, right) => right.length - left.length || left[0].title.localeCompare(right[0].title));

  return { missingLocalCovers, unsupportedLocalCovers, duplicateCatalogGroups };
}

function printSamples(label, rows) {
  if (rows.length === 0) return;
  console.error(`\n${label}:`);
  for (const row of rows.slice(0, 10)) {
    console.error(`- ${row.gameId}: ${row.title} -> ${row.coverUrl}`);
  }
}

async function main() {
  const games = await loadGames();
  if (games.length === 0) return;

  const { missingLocalCovers, unsupportedLocalCovers, duplicateCatalogGroups } = analyze(games);

  console.error("Cover integrity check");
  console.error(`- games checked: ${games.length}`);
  console.error(`- missing local covers: ${missingLocalCovers.length}`);
  console.error(`- unsupported local paths: ${unsupportedLocalCovers.length}`);
  console.error(`- duplicate catalog title groups: ${duplicateCatalogGroups.length}`);

  printSamples("Missing local cover files", missingLocalCovers);
  printSamples("Unsupported local cover paths", unsupportedLocalCovers);

  if (duplicateCatalogGroups.length > 0) {
    console.error("\nDuplicate catalog title groups:");
    for (const group of duplicateCatalogGroups.slice(0, 10)) {
      console.error(`- ${group.map((game) => `${game.title} (${game.gameId})`).join(" | ")}`);
    }
  }

  if (missingLocalCovers.length > 0 || unsupportedLocalCovers.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
