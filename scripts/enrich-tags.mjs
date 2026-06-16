#!/usr/bin/env node
// Assign tags to games with empty tags[] in three phases:
//   1. Genre-based rules (genre_id -> tags)
//   2. Title-pattern rules (keywords in title -> tags)
//   3. RAWG API enrichment (fetch game detail, extract genres/tags)
//
// Usage: node scripts/enrich-tags.mjs
// Progress saved to /tmp/enrich-tags-progress.json (resumable)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const RAWG_API_KEY = process.env.RAWG_API_KEY;

if (!RAWG_API_KEY) {
  console.error("RAWG_API_KEY env var required");
  process.exit(1);
}

const PSQL = `docker exec supabase_db_games-library psql -U postgres -d postgres -t -A -F '|'`;
const PSQL_RAW = `docker exec supabase_db_games-library psql -U postgres -d postgres`;

function sql(cmd) {
  const safe = cmd.replace(/'/g, "'\\''");
  const out = execSync(`${PSQL} -c '${safe}'`, { encoding: "utf-8" });
  return out.trim();
}

function sqlRaw(cmd) {
  const safe = cmd.replace(/'/g, "'\\''");
  execSync(`${PSQL_RAW} -c '${safe}'`, { encoding: "utf-8", stdio: "inherit" });
}

const PROGRESS_FILE = "/tmp/enrich-tags-progress.json";

const GENRE_TAG_MAP = {
  family: ["family", "accessible", "pick_up_and_play"],
  educational: ["educational", "accessible"],
  board_games: ["strategy"],
  card: ["card", "strategy"],
  sports: ["sports"],
  free_to_play: ["accessible"],
  simulation: ["simulation"],
};

const TITLE_RULES = [
  { pattern: "mahjong", tags: ["strategy", "puzzle"] },
  { pattern: "solitaire", tags: ["card", "puzzle"] },
  { pattern: "chess", tags: ["strategy", "strategy"] },
  { pattern: "checkers", tags: ["strategy", "strategy"] },
  { pattern: "crossword", tags: ["puzzle"] },
  { pattern: "sudoku", tags: ["puzzle"] },
  { pattern: "blackjack", tags: ["card"] },
  { pattern: "poker", tags: ["card", "strategy"] },
  { pattern: "bingo", tags: ["party", "family"] },
  { pattern: "casino", tags: ["card"] },
  { pattern: "slots", tags: ["card"] },
  { pattern: "baseball", tags: ["sports"] },
  { pattern: "basketball", tags: ["sports"] },
  { pattern: "football", tags: ["sports"] },
  { pattern: "soccer", tags: ["sports"] },
  { pattern: "hockey", tags: ["sports"] },
  { pattern: "golf", tags: ["sports"] },
  { pattern: "tennis", tags: ["sports"] },
  { pattern: "bowling", tags: ["sports"] },
  { pattern: "boxing", tags: ["sports", "fighting"] },
  { pattern: "wrestling", tags: ["sports", "fighting"] },
  { pattern: "fishing", tags: ["simulation", "chill"] },
  { pattern: "pool", tags: ["sports"] },
  { pattern: "billiard", tags: ["sports"] },
  { pattern: "darts", tags: ["sports"] },
  { pattern: "snowboard", tags: ["sports"] },
  { pattern: "atv", tags: ["racing"] },
  { pattern: "pinball", tags: ["arcade"] },
  { pattern: "hidden object", tags: ["puzzle", "point_and_click"] },
  { pattern: "tetris", tags: ["puzzle"] },
  { pattern: "bobble", tags: ["arcade", "puzzle"] },
  { pattern: "arkanoid", tags: ["arcade", "puzzle"] },
  { pattern: "breakout", tags: ["arcade", "puzzle"] },
  { pattern: "brain age", tags: ["educational", "puzzle"] },
  { pattern: "brain training", tags: ["educational", "puzzle"] },
  { pattern: "big brain academy", tags: ["educational", "puzzle"] },
  { pattern: "art academy", tags: ["educational", "accessible"] },
  { pattern: "math", tags: ["educational", "puzzle"] },
  { pattern: "trivia", tags: ["educational", "party"] },
  { pattern: "cooking", tags: ["simulation", "family"] },
  { pattern: "barbie", tags: ["family", "accessible"] },
  { pattern: "bratz", tags: ["family", "accessible"] },
  { pattern: "petz", tags: ["simulation", "family"] },
  { pattern: "build.a.bear", tags: ["family", "simulation"] },
  { pattern: "fashion", tags: ["simulation", "family"] },
  { pattern: "doll", tags: ["simulation", "family"] },
  { pattern: "pony", tags: ["simulation", "family"] },
  { pattern: "dance", tags: ["rhythm", "family"] },
  { pattern: "music", tags: ["rhythm"] },
  { pattern: "guitar", tags: ["rhythm"] },
  { pattern: "karaoke", tags: ["rhythm", "family"] },
  { pattern: "rhythm", tags: ["rhythm"] },
  { pattern: "sonic", tags: ["platformer", "action_combat"] },
  { pattern: "mario", tags: ["platformer"] },
  { pattern: "kirby", tags: ["platformer", "family"] },
  { pattern: "donkey kong", tags: ["platformer"] },
  { pattern: "crash bandicoot", tags: ["platformer", "action_combat"] },
  { pattern: "spyro", tags: ["platformer", "family"] },
  { pattern: "megaman", tags: ["platformer", "action_combat"] },
  { pattern: "castlevania", tags: ["action_combat", "metroidvania"] },
  { pattern: "metroid", tags: ["action_combat", "metroidvania"] },
  { pattern: "need for speed", tags: ["racing"] },
  { pattern: "gran turismo", tags: ["racing", "simulation"] },
  { pattern: "forza", tags: ["racing", "simulation"] },
  { pattern: "mario kart", tags: ["racing", "family"] },
  { pattern: "ridge racer", tags: ["racing"] },
  { pattern: "final fantasy", tags: ["rpg", "story_rich"] },
  { pattern: "dragon quest", tags: ["rpg", "story_rich"] },
  { pattern: "pokemon", tags: ["rpg", "family"] },
  { pattern: "elder scrolls", tags: ["rpg", "open_world", "exploration"] },
  { pattern: "fallout", tags: ["rpg", "post_apocalyptic", "open_world"] },
  { pattern: "the witcher", tags: ["rpg", "story_rich", "open_world"] },
  { pattern: "mass effect", tags: ["rpg", "sci_fi", "story_rich"] },
  { pattern: "dark souls", tags: ["rpg", "souls_like", "demanding"] },
  { pattern: "elden ring", tags: ["rpg", "souls_like", "open_world"] },
  { pattern: "persona", tags: ["rpg", "story_rich", "turn_based"] },
  { pattern: "xenoblade", tags: ["rpg", "story_rich", "sci_fi"] },
  { pattern: "tales of", tags: ["rpg", "story_rich", "fantasy"] },
  { pattern: "kingdom hearts", tags: ["rpg", "action_combat", "fantasy"] },
  { pattern: "fire emblem", tags: ["rpg", "tactical", "strategy"] },
  { pattern: "civilization", tags: ["strategy", "turn_based"] },
  { pattern: "advance wars", tags: ["strategy", "turn_based"] },
  { pattern: "xcom", tags: ["strategy", "tactical", "turn_based"] },
  { pattern: "anno", tags: ["strategy", "city_building", "simulation"] },
  { pattern: "zelda", tags: ["adventure", "action_combat", "exploration"] },
  { pattern: "god of war", tags: ["action_combat", "hack_and_slash", "story_rich"] },
  { pattern: "uncharted", tags: ["action_combat", "exploration", "story_rich"] },
  { pattern: "tomb raider", tags: ["action_combat", "exploration", "adventure"] },
  { pattern: "assassin", tags: ["action_combat", "open_world", "stealth"] },
  { pattern: "metal gear", tags: ["action_combat", "stealth", "story_rich"] },
  { pattern: "resident evil", tags: ["horror", "action_combat", "survival"] },
  { pattern: "silent hill", tags: ["horror", "survival", "dark"] },
  { pattern: "devil may cry", tags: ["action_combat", "hack_and_slash", "fantasy"] },
  { pattern: "street fighter", tags: ["fighting"] },
  { pattern: "mortal kombat", tags: ["fighting", "dark"] },
  { pattern: "tekken", tags: ["fighting"] },
  { pattern: "super smash", tags: ["fighting", "party", "family"] },
  { pattern: "call of duty", tags: ["shooter", "first_person", "action_combat"] },
  { pattern: "battlefield", tags: ["shooter", "first_person", "action_combat"] },
  { pattern: "halo", tags: ["shooter", "first_person", "sci_fi"] },
  { pattern: "doom", tags: ["shooter", "first_person", "action_combat"] },
  { pattern: "portal", tags: ["puzzle", "first_person", "sci_fi"] },
  { pattern: "bioshock", tags: ["shooter", "first_person", "sci_fi", "horror"] },
  { pattern: "far cry", tags: ["shooter", "first_person", "open_world"] },
  { pattern: "borderlands", tags: ["shooter", "first_person", "rpg"] },
  { pattern: "splatoon", tags: ["shooter", "family", "competitive_multiplayer"] },
  { pattern: "tom clancy", tags: ["shooter", "tactical", "stealth"] },
  { pattern: "splinter cell", tags: ["stealth", "action_combat"] },
  { pattern: "hitman", tags: ["stealth", "action_combat"] },
  { pattern: "star wars", tags: ["sci_fi", "action_combat", "fantasy"] },
  { pattern: "harry potter", tags: ["fantasy", "adventure", "family"] },
  { pattern: "hollow knight", tags: ["metroidvania", "action_combat", "exploration"] },
  { pattern: "celeste", tags: ["platformer", "challenging"] },
  { pattern: "stardew valley", tags: ["simulation", "farming", "chill"] },
  { pattern: "hades", tags: ["roguelike", "action_combat", "mythological"] },
  { pattern: "dead cells", tags: ["roguelike", "action_combat", "metroidvania"] },
  { pattern: "minecraft", tags: ["sandbox", "survival", "procedural"] },
  { pattern: "fortnite", tags: ["shooter", "competitive_multiplayer", "online_multiplayer"] },
  { pattern: "among us", tags: ["social_deduction", "multiplayer", "party"] },
  { pattern: "lego", tags: ["family", "adventure", "action_combat"] },
  { pattern: "disney", tags: ["family", "adventure"] },
  { pattern: "luigi.s mansion", tags: ["adventure", "horror", "family"] },
  { pattern: "pikmin", tags: ["strategy", "adventure", "family"] },
  { pattern: "south park", tags: ["rpg", "comedy", "satirical"] },
  { pattern: "new pok.mon snap", tags: ["simulation", "family", "exploration"] },
  { pattern: "senua", tags: ["action_combat", "dark", "story_rich"] },
  { pattern: "hellblade", tags: ["action_combat", "dark", "story_rich"] },
  { pattern: "l.a. noire", tags: ["action_combat", "story_rich", "noir"] },
  { pattern: "marvel ultimate alliance", tags: ["action_combat", "rpg", "fantasy"] },
  { pattern: "guardians of the galaxy", tags: ["action_combat", "adventure", "sci_fi"] },
];

const RAWG_GENRE_TAG_MAP = {
  action: ["action_combat"],
  adventure: ["exploration", "story_rich"],
  "action-adventure": ["action_combat", "exploration"],
  rpg: ["lore_heavy", "story_rich"],
  "role-playing-games-rpg": ["lore_heavy", "story_rich"],
  "massively-multiplayer": ["mmo"],
  strategy: ["tactical"],
  simulation: ["sandbox"],
  sports: ["racing"],
  racing: ["racing"],
  fighting: ["fighting"],
  shooter: ["shooter", "ranged_focused"],
  puzzle: ["puzzle"],
  platformer: ["platformer"],
  indie: ["indie"],
  casual: ["chill", "pick_up_and_play"],
  "visual-novel": ["text_based", "story_rich"],
  "point-and-click": ["puzzle", "text_based"],
  horror: ["horror"],
  "open-world": ["open_world"],
  "souls-like": ["souls_like", "demanding"],
  metroidvania: ["metroidvania"],
  roguelike: ["roguelike"],
  "turn-based": ["turn_based", "turn_based_combat"],
  "real-time": ["real_time", "real_time_combat"],
  stealth: ["stealth", "stealth_combat"],
  "hack-and-slash": ["hack_and_slash"],
  "card-game": ["deck_building"],
  "board-game": ["strategy"],
  "board-games": ["strategy"],
  "party-game": ["local_multiplayer", "lighthearted"],
  rhythm: ["rhythm", "rhythm_combat"],
  arcade: ["pick_up_and_play", "short_sessions"],
  family: ["family", "accessible"],
  educational: ["accessible"],
};

const TAG_RAW_MAP = {
  atmospheric: ["atmospheric_audio"],
  "story-rich": ["story_rich"],
  "great-soundtrack": ["great_soundtrack"],
  "souls-like": ["souls_like", "demanding"],
  difficult: ["demanding"],
  horror: ["horror"],
  "open-world": ["open_world"],
  exploration: ["exploration"],
  "turn-based": ["turn_based", "turn_based_combat"],
  "turn-based-combat": ["turn_based_combat"],
  "turn-based-strategy": ["tactical", "turn_based_combat"],
  "real-time": ["real_time"],
  stealth: ["stealth", "stealth_combat"],
  "single-player": ["single_player"],
  "multi-player": ["online_multiplayer"],
  "online-co-op": ["co_op", "online_multiplayer"],
  "local-co-op": ["co_op", "local_multiplayer"],
  "co-op": ["co_op"],
  competitive: ["competitive_multiplayer"],
  fantasy: ["fantasy"],
  "sci-fi": ["sci_fi"],
  cyberpunk: ["cyberpunk"],
  party: ["party"],
  "role-playing": ["rpg"],
  "battle-action": ["action_combat"],
  puzzles: ["puzzle"],
  fight: ["action_combat"],
  sandbox: ["sandbox"],
  survival: ["survival"],
  battle: ["action_combat"],
  combat: ["action_combat"],
  "2-players": ["local_multiplayer"],
  "alternating-turns": ["local_multiplayer", "turn_based"],
};

function loadProgress() {
  if (existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8"));
    } catch {
      // ignore
    }
  }
  return { processed: [], noData: [] };
}

function saveProgress(processed, noData) {
  writeFileSync(PROGRESS_FILE, JSON.stringify({ processed, noData }, null, 2));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rawgToTags(game) {
  const tags = [];
  for (const genre of game.genres || []) {
    const mapped = RAWG_GENRE_TAG_MAP[genre.slug];
    if (mapped) tags.push(...mapped);
  }
  for (const tag of game.tags || []) {
    const mapped = TAG_RAW_MAP[tag.slug];
    if (mapped) tags.push(...mapped);
  }
  const esrb = game.esrb_rating?.slug;
  if (esrb === "mature" || esrb === "adults-only") tags.push("dark");
  if (esrb === "everyone") tags.push("family");
  if (esrb === "everyone-10-plus") tags.push("accessible");
  const metacritic = game.metacritic;
  if (metacritic >= 90) tags.push("aaa");
  else if (metacritic >= 85) tags.push("aaa_adjacent");
  return [...new Set(tags.filter(Boolean))].sort();
}

function matchTitleRules(title) {
  const lower = title.toLowerCase();
  const matched = new Set();
  for (const rule of TITLE_RULES) {
    if (lower.includes(rule.pattern)) {
      for (const tag of rule.tags) matched.add(tag);
    }
  }
  return [...matched].sort();
}

function assignTagsSQL(entries) {
  if (entries.length === 0) return;

  // Ensure all tag IDs exist in the tags table
  const allTags = new Set();
  for (const e of entries) {
    for (const t of e.tags) allTags.add(t);
  }
  const ensureTagSql = [...allTags]
    .map((t) => {
      const safe = t.replace(/'/g, "''");
      return `('${safe}', '${safe}')`;
    })
    .join(",");
  sqlRaw(`INSERT INTO games_library.tags (id, name) VALUES ${ensureTagSql} ON CONFLICT (id) DO NOTHING;`);

  const values = entries
    .map((e) => {
      const tagsArr = e.tags.map((t) => `'${t.replace(/'/g, "''")}'`).join(",");
      return `('${e.game_id.replace(/'/g, "''")}', ARRAY[${tagsArr}])`;
    })
    .join(",\n");

  const sql = `
    INSERT INTO games_library.game_tags (game_id, tag_id)
    SELECT g.game_id, unnest(g.new_tags)
    FROM (VALUES ${values}) AS g(game_id, new_tags)
    ON CONFLICT (game_id, tag_id) DO NOTHING;

    UPDATE games_library.games g SET tags = g2.new_tags
    FROM (VALUES ${values}) AS g2(game_id, new_tags)
    WHERE g.game_id = g2.game_id;
  `;
  sqlRaw(sql);
}

// ── Phase 1: rules-based (genre + title patterns) ────────────

async function phase1Rules(candidates, processed, noDataSet) {
  console.log(`\nPhase 1: rules-based enrichment (${candidates.length} candidates)`);
  let count = 0;
  let batch = [];

  for (let i = 0; i < candidates.length; i++) {
    const g = candidates[i];
    if (processed.has(g.game_id)) continue;

    let tags = [];
    if (g.genre_id && GENRE_TAG_MAP[g.genre_id]) {
      tags = GENRE_TAG_MAP[g.genre_id];
    } else {
      tags = matchTitleRules(g.title);
    }

    if (tags.length > 0) {
      batch.push({ game_id: g.game_id, tags });
      processed.add(g.game_id);
    }

    if (batch.length >= 100 || i === candidates.length - 1) {
      if (batch.length > 0) {
        assignTagsSQL(batch);
        count += batch.length;
      }
      saveProgress([...processed], [...noDataSet]);
      batch.length = 0;
    }

    if ((i + 1) % 200 === 0 || i === candidates.length - 1) {
      console.log(`  [${i + 1}/${candidates.length}] tagged=${count}`);
    }
  }

  return count;
}

// ── Phase 2: RAWG API enrichment ─────────────────────────────

async function phase2Rawg(candidates, processed, noDataSet) {
  console.log(`\nPhase 2: RAWG API enrichment (${candidates.length} candidates)`);
  let updated = 0;
  let errors = 0;
  let batch = [];

  for (let i = 0; i < candidates.length; i++) {
    const game = candidates[i];
    if (processed.has(game.game_id)) continue;
    if (noDataSet.has(game.game_id)) continue;

    const rawgId = game.source_ref?.replace("rawg:", "");
    if (!rawgId || rawgId === game.source_ref) {
      noDataSet.add(game.game_id);
      continue;
    }

    const url = `https://api.rawg.io/api/games/${rawgId}?key=${RAWG_API_KEY}`;
    const res = await fetch(url);

    if (res.ok) {
      const data = await res.json();
      const tags = rawgToTags(data);
      if (tags.length > 0) {
        batch.push({ game_id: game.game_id, tags });
        processed.add(game.game_id);
      } else {
        noDataSet.add(game.game_id);
      }
    } else {
      errors++;
      noDataSet.add(game.game_id);
    }

    if ((i + 1) % 100 === 0 || i === candidates.length - 1) {
      // Save progress every 100 games regardless of batch state
      if (batch.length > 0) {
        assignTagsSQL(batch);
        updated += batch.length;
        batch.length = 0;
      }
      saveProgress([...processed], [...noDataSet]);
      console.log(`  [${i + 1}/${candidates.length}] updated=${updated} errors=${errors}`);
    }

    await sleep(260);
  }

  return { updated, errors, noDataCount: noDataSet.size };
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  const { processed: doneList, noData: noDataList } = loadProgress();
  const processed = new Set(doneList);
  const noDataSet = new Set(noDataList);
  console.log(`Progress: ${processed.size} processed, ${noDataSet.size} no-data`);

  // Load candidates via direct SQL
  const raw = sql(`
    SELECT jsonb_agg(jsonb_build_object(
      'game_id', game_id,
      'title', title,
      'genre_id', genre_id,
      'source_ref', source_ref
    ) ORDER BY game_id)
    FROM games_library.games
    WHERE cardinality(tags) = 0
  `);
  const candidates = JSON.parse(raw || "[]");
  console.log(`Loaded ${candidates.length} untagged games`);

  // Phase 1
  const p1 = await phase1Rules(candidates, processed, noDataSet);
  console.log(`Phase 1 done: ${p1} games tagged via rules`);

  // Phase 2
  let rawgCandidates = candidates.filter(
    (g) => g.source_ref && g.source_ref.startsWith("rawg:")
  );
  // Filter out already-attempted games, then apply MAX_PHASE2
  const blocked = new Set([...processed, ...noDataSet]);
  rawgCandidates = rawgCandidates.filter((g) => !blocked.has(g.game_id));
  const MAX_PHASE2 = parseInt(process.env.MAX_PHASE2 || "99999", 10);
  rawgCandidates = rawgCandidates.slice(0, MAX_PHASE2);
  console.log(`\nPhase 2 candidates: ${rawgCandidates.length} (MAX_PHASE2=${MAX_PHASE2})`);

  let p2 = { updated: 0, errors: 0, noDataCount: noDataSet.size };
  if (rawgCandidates.length > 0) {
    p2 = await phase2Rawg(rawgCandidates, processed, noDataSet);
  }

  const stillUntagged = parseInt(sql("SELECT COUNT(*) FROM games_library.games WHERE cardinality(tags) = 0") || "0", 10);

  const notCovered = candidates.filter((g) => !processed.has(g.game_id));
  const nonRawgLeft = notCovered.filter((g) => !g.source_ref?.startsWith("rawg:"));

  console.log(`\n=========== Final Summary ===========`);
  console.log(`Phase 1 (rules):         ${p1} games`);
  console.log(`Phase 2 (RAWG API):      ${p2.updated} games`);
  console.log(`RAWG API errors:         ${p2.errors}`);
  console.log(`RAWG no-data (no genre): ${notCovered.filter(g => g.source_ref?.startsWith("rawg:")).length}`);
  console.log(`Non-RAWG remaining:      ${nonRawgLeft.length}`);
  console.log(`Still untagged:          ${stillUntagged}`);
  console.log(`Progress file:           ${PROGRESS_FILE}`);

  if (nonRawgLeft.length > 0) {
    console.log(`\nNon-RAWG games still untagged (need manual review):`);
    for (const g of nonRawgLeft) {
      console.log(`  ${g.game_id}  ${g.title}`);
    }
  }
}

main().catch(console.error);
