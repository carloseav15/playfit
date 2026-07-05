// Matches the gamesdatabase.org PSP scrape (reports/gamesdatabase-psp.json)
// against our PSP catalog by exact normalized title. Same conservative
// methodology as the psxdatacenter passes: category strings ("Shooter / TPV",
// "Role Playing Game") are mapped to our controlled genre vocabulary only via
// an exact compound match or a curated first-segment synonym; anything
// ambiguous is left unmapped. Rows where the site's year and our existing
// release_year differ by more than 3 years are excluded as likely title
// collisions with an unrelated game sharing the same name.
import { readFileSync, writeFileSync } from "node:fs";

const SCRAPE_FILE = new URL("../reports/gamesdatabase-psp.json", import.meta.url);
const PSP_TSV = "/private/tmp/claude-501/-Users-carancibia-Projects-playfit/1d7a580e-06e2-486a-bb08-4bee589bdee0/scratchpad/psp_games.tsv";
const OUT_FILE = new URL("../reports/gamesdatabase-psp-apply.json", import.meta.url);

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
    .replace(/[̀-ͯ]/g, "")
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
  const pspRows = readFileSync(PSP_TSV, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [game_id, title, genre_id, cover_url, release_year] = line.split("\t");
      return { game_id, title, genre_id: genre_id || null, cover_url: cover_url || null, release_year: release_year ? Number(release_year) : null };
    });

  const byNormTitle = new Map();
  for (const row of pspRows) {
    const key = normalizeTitle(row.title);
    if (!byNormTitle.has(key)) byNormTitle.set(key, []);
    byNormTitle.get(key).push(row);
  }

  const results = [];
  let matched = 0;
  let ambiguous = 0;
  let yearExcluded = 0;
  for (const s of scraped) {
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

    results.push({
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

  writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));

  console.log(`Scraped: ${scraped.length}`);
  console.log(`Matched: ${matched}`);
  console.log(`Ambiguous (multiple games share title): ${ambiguous}`);
  console.log(`Excluded (year gap > 3): ${yearExcluded}`);
  console.log(`Unmatched: ${scraped.length - matched - ambiguous - yearExcluded}`);
  console.log(`With genre to apply: ${results.filter((r) => r.apply_genre).length}`);
  console.log(`Needing cover: ${results.filter((r) => r.needs_cover).length}`);
}

main();
