// Matches the psxdatacenter.com NTSC-U scrape (reports/psxdatacenter-ps1-ntscu.json)
// against our PS2 catalog by exact normalized title, and maps the site's free-text
// genre string to our controlled genre vocabulary conservatively: only the FIRST
// "/"-separated segment is considered, and only if it (or a small curated synonym)
// matches an existing base genre id exactly. Ambiguous/compound genre strings are
// left unmapped rather than guessed.
import { readFileSync, writeFileSync } from "node:fs";

const SCRAPE_FILE = new URL("../reports/psxdatacenter-ps1-ntscu.json", import.meta.url);
const PS1_TSV = "/private/tmp/claude-501/-Users-carancibia-Projects-playfit/1d7a580e-06e2-486a-bb08-4bee589bdee0/scratchpad/ps1_games.tsv";
const OUT_FILE = new URL("../reports/psxdatacenter-ps1-apply.json", import.meta.url);

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
  "first person shooter": "shooter",
  "driving": "racing",
  "horse racing": "racing",
  "car racing": "racing",
  "beat em up": "fighting",
  "flight simulator": "simulation",
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

function mapGenre(genreStr) {
  if (!genreStr) return null;
  const segments = genreStr.split("/").map(normalizeGenreSegment).filter(Boolean);

  // Prefer an exact compound match against the full controlled vocabulary
  // (e.g. "Action / RPG" -> "action_rpg", which exists) over discarding the
  // second segment's signal.
  const joined = segments.map((s) => s.replace(/\s+/g, "_")).join("_");
  if (ALL_GENRE_IDS.has(joined)) return joined;

  const first = segments[0];
  if (BASE_GENRES.has(first)) return first;
  if (GENRE_SYNONYMS[first]) return GENRE_SYNONYMS[first];
  return null;
}

function parseYear(dateReleased) {
  if (!dateReleased) return null;
  const m = dateReleased.match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

function main() {
  const scraped = JSON.parse(readFileSync(SCRAPE_FILE, "utf8"));
  const ps2Rows = readFileSync(PS1_TSV, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [game_id, title, genre_id, cover_url, release_year] = line.split("\t");
      return { game_id, title, genre_id: genre_id || null, cover_url: cover_url || null, release_year: release_year ? Number(release_year) : null };
    });

  const byNormTitle = new Map();
  for (const row of ps2Rows) {
    const key = normalizeTitle(row.title);
    if (!byNormTitle.has(key)) byNormTitle.set(key, []);
    byNormTitle.get(key).push(row);
  }

  const results = [];
  let matched = 0;
  let ambiguous = 0;
  for (const s of scraped) {
    const title = s.officialTitle || s.title;
    const key = normalizeTitle(title);
    const candidates = byNormTitle.get(key);
    if (!candidates || candidates.length === 0) continue;
    if (candidates.length > 1) {
      ambiguous += 1;
      continue;
    }
    const game = candidates[0];
    const mappedGenre = mapGenre(s.genre);
    const year = parseYear(s.dateReleased);

    // A large year gap between our existing record and the scraped PS2 release
    // date usually means the title string collides with an unrelated game (a
    // remake/reboot sharing the same name, e.g. "God of War" 2018 vs the 2005
    // PS2 original) rather than genuine regional release-date variance, which
    // tops out around 2-3 years in the data. Skip those rows entirely rather
    // than risk attaching the wrong developer/publisher/genre.
    if (game.release_year && year && Math.abs(game.release_year - year) > 3) {
      continue;
    }

    matched += 1;
    results.push({
      game_id: game.game_id,
      title: game.title,
      serial: s.serial,
      psx_genre_raw: s.genre,
      apply_genre: !game.genre_id ? mappedGenre : null,
      apply_developer: s.developer ? s.developer.replace(/\.$/, "").trim() : null,
      apply_publisher: s.publisher ? s.publisher.replace(/\.$/, "").trim() : null,
      apply_release_year: year,
      current_release_year: game.release_year,
    });
  }

  writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));

  console.log(`Scraped: ${scraped.length}`);
  console.log(`Matched (unique title): ${matched}`);
  console.log(`Ambiguous (multiple games share title): ${ambiguous}`);
  console.log(`Unmatched: ${scraped.length - matched - ambiguous}`);
  console.log(`With genre to apply: ${results.filter((r) => r.apply_genre).length}`);
  console.log(`With developer: ${results.filter((r) => r.apply_developer).length}`);
  console.log(`With publisher: ${results.filter((r) => r.apply_publisher).length}`);
  console.log(`Year mismatches (existing vs scraped, both present): ${
    results.filter((r) => r.current_release_year && r.apply_release_year && r.current_release_year !== r.apply_release_year).length
  }`);
}

main();
