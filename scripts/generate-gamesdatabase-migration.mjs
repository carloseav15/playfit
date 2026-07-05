import { readFileSync, writeFileSync } from "node:fs";

const platform = process.argv[2];
if (!platform) {
  console.error("Usage: node generate-gamesdatabase-migration.mjs <platform>");
  process.exit(1);
}

const SCRAPE_FILE = new URL(`../reports/gamesdatabase-${platform}.json`, import.meta.url);
const TSV_FILE = `/tmp/${platform}_games.tsv`;
const APPLY_FILE = new URL(`../reports/gamesdatabase-${platform}-apply.json`, import.meta.url);
const MIGRATION_FILE = new URL(`../supabase/migrations/20260703000002_backfill_${platform}_from_gamesdatabase.sql`, import.meta.url);

const ALL_GENRE_IDS = new Set([
  "action", "action_adventure", "action_game", "action_horror", "action_jrpg",
  "action_platformer", "action_roguelite", "action_rpg", "adventure",
  "adventure_investigation", "adventure_puzzle", "adventure_strategy", "arcade",
  "arcade_racing", "arcade_sports_action", "arena_fighter_rpg_hybrid", "board_games",
  "card", "card_horror_adventure", "card_rpg", "casual",
  "cinematic_action_adventure", "collection", "detective_adventure", "educational",
  "family", "fighting", "fighting_game", "first_person_platformer", "free_to_play",
  "gore", "immersive_sim", "indie", "interactive_drama", "interactive_thriller",
  "investigation_puzzle", "jrpg", "jrpg_platformer", "life_sim_action_rpg",
  "lore_film", "massively_multiplayer", "metroidvania",
  "monster_collecting_action_rpg", "narrative_adventure", "narrative_rpg", "nudity",
  "open_world_action_adventure", "platformer", "point_and_click_adventure", "puzzle",
  "puzzle_adventure", "puzzle_game", "puzzle_platformer", "racing",
  "roguelite_card_game", "role_playing_games_rpg", "rpg",
  "sexual_content", "shooter", "simulation", "sports", "stealth_action", "strategy",
  "strategy_adventure", "stylish_action", "survival_horror", "tactical_rpg",
  "tactical_strategy", "third_person_shooter", "unknown", "violent", "visual_novel",
  "visual_novel_escape", "visual_novel_strategy",
]);

const BASE_GENRES = new Set([
  "action", "adventure", "rpg", "puzzle", "strategy", "simulation",
  "sports", "racing", "fighting", "platformer", "educational", "family", "shooter",
]);

const GENRE_SYNONYMS = {
  "role playing game": "rpg",
  "first person shooter": "shooter",
  "third person shooter": "third_person_shooter",
  "driving": "racing",
  "beat em up": "fighting",
  "flight simulator": "simulation",
  "sports football (soccer)": "sports",
};

function normalizeTitle(t) {
  return t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeGenreSegment(s) {
  return s
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[.]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mapGenre(categoryStr) {
  if (!categoryStr) return null;
  const whole = normalizeGenreSegment(categoryStr);
  if (GENRE_SYNONYMS[whole]) return GENRE_SYNONYMS[whole];

  const segments = categoryStr.split("/").map(normalizeGenreSegment).filter(Boolean);
  const joined = segments.map((s) => s.replace(/\s+/g, "_")).join("_");
  if (ALL_GENRE_IDS.has(joined)) return joined;

  const first = segments[0];
  if (BASE_GENRES.has(first)) return first;
  if (GENRE_SYNONYMS[first]) return GENRE_SYNONYMS[first];
  return null;
}

function main() {
  const scraped = JSON.parse(readFileSync(SCRAPE_FILE, "utf8"));
  const catalogRows = readFileSync(TSV_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [game_id, title, genre_id, cover_url, release_year] = line.split("\t");
      return { game_id, title, genre_id: genre_id || null, cover_url: cover_url || null, release_year: release_year ? Number(release_year) : null };
    });

  const byNormTitle = new Map();
  for (const row of catalogRows) {
    const key = normalizeTitle(row.title);
    if (!byNormTitle.has(key)) byNormTitle.set(key, []);
    byNormTitle.get(key).push(row);
  }

  const matchResults = [];
  let matched = 0;
  let ambiguous = 0;
  let yearExcluded = 0;
  for (const s of scraped) {
    if (s.error) continue;
    const key = normalizeTitle(s.title);
    const candidates = byNormTitle.get(key);
    if (!candidates || candidates.length === 0) continue;
    if (candidates.length > 1) {
      ambiguous += 1;
      continue;
    }
    const game = candidates[0];

    if (game.release_year && s.year && Math.abs(game.release_year - s.year) > 3) {
      yearExcluded += 1;
      continue;
    }

    matched += 1;
    const mappedGenre = mapGenre(s.category);

    matchResults.push({
      game_id: game.game_id,
      title: game.title,
      slug: s.slug,
      gdb_category_raw: s.category,
      apply_genre: !game.genre_id ? mappedGenre : null,
      apply_developer: s.developer,
      apply_publisher: s.publisher,
      apply_year: s.year,
      current_release_year: game.release_year,
      needs_cover: !game.cover_url,
    });
  }

  writeFileSync(APPLY_FILE, JSON.stringify(matchResults, null, 2));

  // Generate SQL
  const sqlLines = ["begin;", ""];
  const genreRows = [];
  const companyRows = [];

  for (const r of matchResults) {
    if (r.apply_genre) {
      genreRows.push(`('${r.game_id}', '${r.apply_genre}')`);
    }
    if (r.apply_developer) {
      companyRows.push(`('${r.game_id}', '${r.apply_developer.replace(/'/g, "''")}', 'developer', '${r.slug}')`);
    }
    if (r.apply_publisher) {
      companyRows.push(`('${r.game_id}', '${r.apply_publisher.replace(/'/g, "''")}', 'publisher', '${r.slug}')`);
    }
  }

  if (genreRows.length > 0) {
    sqlLines.push("-- Genre backfill");
    sqlLines.push("with backfill(game_id, genre_id) as (");
    sqlLines.push("  values");
    sqlLines.push("    " + genreRows.join(",\n    "));
    sqlLines.push(")");
    sqlLines.push("update games_library.games g");
    sqlLines.push("set genre_id = b.genre_id");
    sqlLines.push("from backfill b");
    sqlLines.push("where g.game_id = b.game_id");
    sqlLines.push("  and g.genre_id is null;");
    sqlLines.push("");
  }

  if (companyRows.length > 0) {
    sqlLines.push("-- Game companies (developer + publisher)");
    const chunkSize = 100;
    for (let i = 0; i < companyRows.length; i += chunkSize) {
      const chunk = companyRows.slice(i, i + chunkSize);
      sqlLines.push("insert into games_library.game_companies (game_id, company_name, role, source, source_key)");
      sqlLines.push("select game_id, company_name, role, 'gamesdatabase', source_key");
      sqlLines.push("from (values");
      sqlLines.push("    " + chunk.join(",\n    "));
      sqlLines.push(") as b(game_id, company_name, role, source_key)");
      sqlLines.push("on conflict (game_id, company_name, role, source) do nothing;");
      sqlLines.push("");
    }
  }

  sqlLines.push("commit;");
  writeFileSync(MIGRATION_FILE, sqlLines.join("\n"));

  console.log(`\n=== ${platform} ===`);
  console.log(`Scraped: ${scraped.length}`);
  console.log(`Matched: ${matched}`);
  console.log(`Ambiguous: ${ambiguous}`);
  console.log(`Year-excluded: ${yearExcluded}`);
  console.log(`Unmatched (by title): ${scraped.length - matched - ambiguous - yearExcluded}`);
  console.log(`Genres to apply: ${genreRows.length}`);
  console.log(`Companies to insert: ${companyRows.length}`);
  console.log(`Games needing cover: ${matchResults.filter(r => r.needs_cover).length}`);
  console.log(`Migration: ${MIGRATION_FILE.pathname}`);
}

main();
