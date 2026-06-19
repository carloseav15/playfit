import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const PROGRESS_FILE = "/tmp/rawg-scrape-progress.json";
const API_DELAY_MS = 800;
const PAGE_SIZE = 40;
const FLUSH_BATCH = 50;
const MAX_PAGES_PER_YEAR = 25;
const MAX_RETRO_PAGES = 20;

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  throw new Error("SUPABASE_SERVICE_KEY is required to run scrape-rawg.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: "games_library" },
});

const RAWG_PLATFORMS = {
  "3ds": { id: 8, name: "Nintendo 3DS" },
  android: { id: 21, name: "Android" },
  atari_2600: { id: 23, name: "Atari 2600" },
  dreamcast: { id: 106, name: "Dreamcast" },
  ds: { id: 9, name: "Nintendo DS" },
  gb: { id: 26, name: "Game Boy" },
  gba: { id: 24, name: "Game Boy Advance" },
  gbc: { id: 43, name: "Game Boy Color" },
  game_gear: { id: 77, name: "Game Gear" },
  gamecube: { id: 105, name: "GameCube" },
  genesis: { id: 167, name: "Genesis" },
  ios: { id: 3, name: "iOS" },
  linux: { id: 6, name: "Linux" },
  macos: { id: 5, name: "macOS" },
  n64: { id: 83, name: "Nintendo 64" },
  neo_geo: { id: 12, name: "Neo Geo" },
  nes: { id: 49, name: "NES" },
  pc: { id: 4, name: "PC" },
  ps1: { id: 27, name: "PlayStation" },
  ps2: { id: 15, name: "PlayStation 2" },
  ps3: { id: 16, name: "PlayStation 3" },
  ps4: { id: 18, name: "PlayStation 4" },
  ps5: { id: 187, name: "PlayStation 5" },
  psp: { id: 17, name: "PSP" },
  ps_vita: { id: 19, name: "PS Vita" },
  saturn: { id: 107, name: "SEGA Saturn" },
  sega_master_system: { id: 74, name: "SEGA Master System" },
  snes: { id: 79, name: "SNES" },
  switch_1: { id: 7, name: "Nintendo Switch" },
  wii: { id: 11, name: "Wii" },
  wii_u: { id: 10, name: "Wii U" },
  xbox_360: { id: 14, name: "Xbox 360" },
  xbox_one: { id: 1, name: "Xbox One" },
  xbox_original: { id: 80, name: "Xbox" },
  xbox_series_xs: { id: 186, name: "Xbox Series X|S" },
};

const RAWG_ID_TO_INTERNAL = Object.fromEntries(
  Object.entries(RAWG_PLATFORMS).map(([key, val]) => [val.id, key]),
);

const RAWG_NAME_TO_INTERNAL = Object.fromEntries(
  Object.entries(RAWG_PLATFORMS).map(([key, val]) => [val.name, key]),
);

const MODERN_PLATFORMS = [
  "xbox_series_xs",
  "switch_1",
  "pc",
  "macos",
  "ps5",
  "ps4",
  "xbox_one",
  "ios",
  "android",
  "linux",
];

const RETRO_PLATFORMS = [
  "psp",
  "ps1",
  "3ds",
  "ds",
  "gba",
  "xbox_360",
  "ps3",
  "ps2",
  "wii",
  "wii_u",
  "snes",
  "nes",
  "n64",
  "gamecube",
  "ps_vita",
  "gbc",
  "gb",
  "dreamcast",
  "saturn",
  "genesis",
  "xbox_original",
  "sega_master_system",
  "neo_geo",
  "game_gear",
  "atari_2600",
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
  "board-game": ["deck_building"],
  "party-game": ["local_multiplayer", "lighthearted"],
  rhythm: ["rhythm", "rhythm_combat"],
  arcade: ["pick_up_and_play", "short_sessions"],
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
  "post-apocalyptic": ["post_apocalyptic"],
  "pixel-art": ["pixel_art"],
  "3d": ["3d_cg"],
  "2d": ["2d_flat"],
  "first-person": ["first_person", "first_person_3d"],
  "third-person": ["third_person", "third_person_3d"],
  "third-person-shooter": ["shooter", "third_person", "third_person_3d"],
  "first-person-shooter": ["shooter", "first_person", "first_person_3d"],
  indie: ["indie"],
  "walking-simulator": ["minimalist_story", "exploration"],
  "choices-matter": ["branching_narrative"],
  "multiple-endings": ["multiple_endings"],
  "replay-value": ["high_replayability"],
  moddable: ["moddable"],
  "base-building": ["base_building"],
  crafting: ["crafting"],
  survival: ["survival"],
  roguelike: ["roguelike"],
  "rogue-like": ["roguelike"],
  metroidvania: ["metroidvania"],
  platformer: ["platformer"],
  puzzle: ["puzzle"],
  "point-and-click": ["puzzle"],
  "side-scroller": ["side_scroller"],
  "top-down": ["top_down"],
  isometric: ["isometric"],
  vr: ["vr"],
  retro: ["retro_revival"],
  comedy: ["comedy", "lighthearted"],
  dark: ["dark"],
  cute: ["cozy", "whimsical"],
  relaxing: ["chill", "cozy"],
  "fast-paced": ["action_combat"],
  "shoot-em-up": ["shooter", "bullet_hell"],
  bullethell: ["bullet_hell", "bullet_hell_combat"],
};

function isEasterEgg(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return (
    (d.getMonth() + 1 === 4 && d.getDate() === 1) || (d.getMonth() + 1 === 2 && d.getDate() === 29)
  );
}

function makeGameId(title) {
  const safe = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
  return safe;
}

function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapRawgPlatformId(rawgId) {
  return RAWG_ID_TO_INTERNAL[rawgId] || null;
}

function mapRawgPlatformName(name) {
  return RAWG_NAME_TO_INTERNAL[name] || null;
}

function extractPlatformIds(game) {
  const ids = [];
  for (const entry of game.platforms || []) {
    const pid = mapRawgPlatformId(entry.platform?.id);
    if (pid && !ids.includes(pid)) ids.push(pid);
  }
  if (ids.length === 0) {
    for (const pp of game.parent_platforms || []) {
      const slug = pp.platform?.slug;
      if (slug === "pc") { if (!ids.includes("pc")) ids.push("pc"); }
      else if (slug === "playstation") {
        if (game.platforms?.some((p) => p.platform?.slug?.includes("playstation-5"))) {
          if (!ids.includes("ps5")) ids.push("ps5");
        }
        if (!ids.includes("ps4")) ids.push("ps4");
      }
      else if (slug === "xbox") {
        if (game.platforms?.some((p) => p.platform?.slug?.includes("xbox-series"))) {
          if (!ids.includes("xbox_series_xs")) ids.push("xbox_series_xs");
        }
        if (!ids.includes("xbox_one")) ids.push("xbox_one");
      }
      else if (slug === "nintendo") { if (!ids.includes("switch_1")) ids.push("switch_1"); }
      else if (slug === "ios") { if (!ids.includes("ios")) ids.push("ios"); }
      else if (slug === "android") { if (!ids.includes("android")) ids.push("android"); }
      else if (slug === "macos") { if (!ids.includes("macos")) ids.push("macos"); }
      else if (slug === "linux") { if (!ids.includes("linux")) ids.push("linux"); }
    }
  }
  return ids;
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
    else if (tag.slug) {
      if (tag.slug.includes("single") || tag.slug.includes("solo")) tags.push("single_player");
      if (tag.slug.includes("coop") || tag.slug.includes("co-op")) tags.push("co_op");
      if (tag.slug.includes("multiplayer")) tags.push("online_multiplayer");
      if (tag.slug.includes("story") || tag.slug.includes("narrative") || tag.slug.includes("rich"))
        tags.push("story_rich");
      if (tag.slug.includes("atmospheric")) tags.push("atmospheric_audio");
      if (tag.slug.includes("lore")) tags.push("lore_heavy");
      if (tag.slug.includes("sandbox")) tags.push("sandbox");
    }
  }

  if (game.metacritic >= 90) tags.push("aaa");
  else if (game.metacritic >= 85) tags.push("aaa_adjacent");
  if (game.metacritic >= 95) tags.push("cinematic");

  const esrb = game.esrb_rating?.slug;
  if (esrb === "mature" || esrb === "adults-only") tags.push("dark");

  return [...new Set(tags.filter(Boolean))].sort();
}

function toGameRow(game, platformIds) {
  const gameId = makeGameId(game.name);
  const releaseYear = game.released ? game.released.slice(0, 4) : "";
  const released = game.released && game.released <= new Date().toISOString().slice(0, 10);
  const platformNames = platformIds.map((pid) => RAWG_PLATFORMS[pid]?.name || pid).filter(Boolean);

  return {
    game_id: gameId,
    title: game.name,
    aliases: [],
    genre_id: (game.genres || [])[0]?.slug || null,
    release_year: releaseYear,
    release_state: released ? "released" : "unreleased",
    source_type: "finder",
    source_ref: `rawg:${game.id}`,
    cover_url: game.background_image || "",
    tags: rawgToTags(game),
    notes: [game.rating ? `RAWG Rating: ${game.rating}` : "", game.metacritic ? `Metacritic: ${game.metacritic}` : ""].filter(Boolean).join(" | "),
    sort_date: game.released || "",
    release_label: "",
    platforms: platformIds,
    platform_names: platformNames,
  };
}

function toScoreRows(gameId, game) {
  const rows = [];
  const sourceKey = `rawg:${game.id}`;
  if (game.metacritic != null || game.rating != null) {
    rows.push({
      game_id: gameId,
      platform_id: null,
      score_source: "rawg",
      critic_score: game.metacritic ?? null,
      critic_count: null,
      user_score: game.rating ?? null,
      user_count: game.ratings_count ?? null,
      source_key: sourceKey,
      metadata: {},
    });
  }
  return rows;
}

function toAgeRatingRows(gameId, game) {
  if (!game.esrb_rating?.slug) return [];
  return [
    {
      game_id: gameId,
      platform_id: null,
      rating_board: "ESRB",
      rating: game.esrb_rating.name || game.esrb_rating.slug,
      descriptors: null,
      source: "rawg",
      source_key: `rawg:${game.id}`,
    },
  ];
}

function toPlatformRows(gameId, game) {
  const rows = [];
  const platformIds = extractPlatformIds(game);
  for (const pid of platformIds) {
    rows.push({ game_id: gameId, platform_id: pid });
  }
  return rows;
}

function toTagRows(gameId, game) {
  const tags = rawgToTags(game);
  return tags.map((tag) => ({ game_id: gameId, tag_id: tag }));
}

function toAliasRows(gameId, detail) {
  if (!detail.alternative_names?.length) return [];
  return detail.alternative_names
    .filter((alias) => alias && alias !== detail.name)
    .map((alias) => ({
      game_id: gameId,
      alias,
    }));
}

function toCompanyRows(gameId, detail) {
  const rows = [];
  const sourceKey = `rawg:${detail.id}`;
  for (const dev of detail.developers || []) {
    rows.push({
      game_id: gameId,
      company_name: dev.name,
      role: "developer",
      source: "rawg",
      source_key: sourceKey,
      metadata: {},
    });
  }
  for (const pub of detail.publishers || []) {
    rows.push({
      game_id: gameId,
      company_name: pub.name,
      role: "publisher",
      source: "rawg",
      source_key: sourceKey,
      metadata: {},
    });
  }
  return rows;
}

function toSummaryRows(gameId, detail) {
  const text = detail.description_raw || detail.description || "";
  if (!text) return [];
  return [
    {
      game_id: gameId,
      summary: text,
      source: "rawg",
      source_key: `rawg:${detail.id}`,
    },
  ];
}

function toReleaseRows(gameId, detail) {
  const rows = [];
  for (const entry of detail.platforms || []) {
    const pid = mapRawgPlatformId(entry.platform?.id);
    if (!pid) continue;
    if (!entry.released_at) continue;
    rows.push({
      game_id: gameId,
      platform_id: pid,
      release_date: entry.released_at,
      release_year: entry.released_at ? parseInt(entry.released_at.slice(0, 4), 10) : null,
      source: "rawg",
      source_key: `rawg:${detail.id}`,
      metadata: {},
    });
  }
  return rows;
}

function toPlatformScoreRows(gameId, detail) {
  const rows = [];
  for (const mp of detail.metacritic_platforms || []) {
    const pid = mapRawgPlatformName(mp.platform?.name);
    if (!pid) continue;
    rows.push({
      game_id: gameId,
      platform_id: pid,
      score_source: "metacritic",
      critic_score: mp.metacritic ?? null,
      critic_count: null,
      user_score: null,
      user_count: null,
      source_key: `rawg:${detail.id}`,
      metadata: { url: mp.url || "" },
    });
  }
  return rows;
}

function toExternalIdRows(gameId, detail) {
  const rows = [];
  if (detail.metacritic_url) {
    rows.push({
      game_id: gameId,
      provider: "metacritic",
      provider_game_key: detail.metacritic_url,
      source_title: detail.name,
      source_platform_id: null,
      confidence_score: 100,
      metadata: {},
    });
  }
  if (detail.reddit_url) {
    const key = detail.reddit_name || detail.reddit_url;
    rows.push({
      game_id: gameId,
      provider: "reddit",
      provider_game_key: key,
      source_title: detail.name,
      source_platform_id: null,
      confidence_score: 100,
      metadata: {},
    });
  }
  return rows;
}

async function loadExistingGames() {
  const ids = new Set();
  const titles = new Set();
  const byRawgId = new Map();
  const hasSummary = new Set();
  let from = 0;
  const pageSize = 1000;
  let done = false;

  while (!done) {
    const { data, error } = await supabase
      .from("games")
      .select("game_id, title, source_ref")
      .range(from, from + pageSize - 1);

    if (error) {
      console.error("Error loading existing games:", error.message);
      return { ids, titles, byRawgId, hasSummary };
    }

    const batch = data ?? [];
    for (const g of batch) {
      if (g.game_id) ids.add(g.game_id);
      if (g.title) titles.add(normalizeTitle(g.title));
      if (g.source_ref?.startsWith("rawg:")) {
        byRawgId.set(g.source_ref, g.game_id);
      }
    }

    from += pageSize;
    if (batch.length < pageSize) done = true;
  }

  from = 0;
  done = false;
  while (!done) {
    const { data, error } = await supabase
      .from("game_summaries")
      .select("game_id")
      .range(from, from + pageSize - 1);

    if (!error) {
      for (const row of data ?? []) {
        hasSummary.add(row.game_id);
      }
    }
    from += pageSize;
    if ((data ?? []).length < pageSize) done = true;
  }

  return { ids, titles, byRawgId, hasSummary };
}

async function ensureGenres(rows) {
  const genreSet = new Set();
  for (const row of rows) {
    if (row.genre_id) genreSet.add(row.genre_id);
  }
  if (genreSet.size === 0) return;
  const genreRows = [...genreSet].map((slug) => ({ id: slug, name: slug }));
  const { error } = await supabase.from("genres").upsert(genreRows, {
    onConflict: "id",
    ignoreDuplicates: true,
  });
  if (error) console.error("Error ensuring genres:", error.message);
}

async function ensureTags(tagSet) {
  if (tagSet.size === 0) return;
  const tagRows = [...tagSet].map((id) => ({ id }));
  const { error } = await supabase.from("tags").upsert(tagRows, {
    onConflict: "id",
    ignoreDuplicates: true,
  });
  if (error) console.error("Error ensuring tags:", error.message);
}

function collectTags(rows) {
  const set = new Set();
  for (const row of rows) {
    for (const t of row.tags || []) {
      if (t) set.add(t);
    }
  }
  return set;
}

async function upsertBatch(table, rows, conflictCols) {
  if (rows.length === 0) return;
  const { error } = await supabase.from(table).upsert(rows, {
    onConflict: conflictCols,
    ignoreDuplicates: true,
  });
  if (error) console.error(`Error upserting ${table}:`, error.message);
}

async function deleteAndInsert(table, rows) {
  if (rows.length === 0) return;
  const { error } = await supabase.from(table).insert(rows);
  if (error) console.error(`Error inserting ${table}:`, error.message);
}

async function deleteGameData(table, column, gameIds) {
  if (gameIds.length === 0) return;
  const { error } = await supabase.from(table).delete().in(column, gameIds);
  if (error) console.error(`Error deleting from ${table}:`, error.message);
}

async function fetchRawgList(apiKey, params) {
  const q = new URLSearchParams({ key: apiKey, page_size: String(PAGE_SIZE), ...params });
  const url = `https://api.rawg.io/api/games?${q}`;
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`  HTTP ${response.status} for ${url.slice(0, 120)}`);
    return null;
  }
  return response.json();
}

async function fetchRawgDetail(apiKey, rawgId) {
  const url = `https://api.rawg.io/api/games/${rawgId}?key=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`  Detail HTTP ${response.status} for game ${rawgId}`);
    return null;
  }
  return response.json();
}

async function fetchYearGames(apiKey, year) {
  const allGames = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= MAX_PAGES_PER_YEAR) {
    const data = await fetchRawgList(apiKey, {
      dates: `${year}-01-01,${year}-12-31`,
      ordering: "-released",
      page: String(page),
    });
    if (!data || !data.results?.length) break;
    allGames.push(...data.results);
    hasMore = data.next !== null;
    page++;
    await sleep(API_DELAY_MS);
  }
  return allGames;
}

async function fetchPlatformGames(apiKey, rawgId) {
  const allGames = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= MAX_RETRO_PAGES) {
    const data = await fetchRawgList(apiKey, {
      platforms: String(rawgId),
      ordering: "-rating",
      page: String(page),
    });
    if (!data || !data.results?.length) break;
    allGames.push(...data.results);
    hasMore = data.next !== null;
    page++;
    await sleep(API_DELAY_MS);
  }
  return allGames;
}

function dedupGames(games, seenTitles, seenIds, existingByRawgId) {
  const newGames = [];
  const updatedGames = [];

  for (const game of games) {
    if (isEasterEgg(game.released)) continue;

    const existingGameId = existingByRawgId.get(`rawg:${game.id}`);
    if (existingGameId) {
      updatedGames.push(game);
      continue;
    }

    const ntitle = normalizeTitle(game.name);
    if (seenTitles.has(ntitle)) continue;

    const gid = makeGameId(game.name);
    if (seenIds.has(gid)) continue;

    seenTitles.add(ntitle);
    seenIds.add(gid);
    newGames.push(game);
  }

  return { newGames, updatedGames };
}

function loadProgress() {
  if (!existsSync(PROGRESS_FILE)) return { lastYear: null, detailQueue: [], detailProcessed: {} };
  try {
    return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8"));
  } catch {
    return { lastYear: null, detailQueue: [], detailProcessed: {} };
  }
}

function saveProgress(progress) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function processListBatch(games, existingByRawgId) {
  const gameRows = [];
  const platformRows = [];
  const tagRows = [];
  const scoreRows = [];
  const ageRatingRows = [];
  const allTags = new Set();
  const upsertedIds = [];

  for (const game of games) {
    const gameId = makeGameId(game.name);
    const pids = extractPlatformIds(game);
    const row = toGameRow(game, pids);

    gameRows.push(row);
    upsertedIds.push(gameId);

    const pRows = toPlatformRows(gameId, game);
    platformRows.push(...pRows);

    const tRows = toTagRows(gameId, game);
    tagRows.push(...tRows);

    const sRows = toScoreRows(gameId, game);
    scoreRows.push(...sRows);

    const aRows = toAgeRatingRows(gameId, game);
    ageRatingRows.push(...aRows);

    for (const t of row.tags || []) {
      if (t) allTags.add(t);
    }

    if (!existingByRawgId.has(`rawg:${game.id}`)) {
      existingByRawgId.set(`rawg:${game.id}`, gameId);
    }
  }

  await ensureGenres(gameRows);
  await ensureTags(allTags);

  if (gameRows.length > 0) {
    const { error } = await supabase.from("games").upsert(gameRows, {
      onConflict: "game_id",
    });
    if (error) {
      console.error("  Error upserting games:", error.message);
      return [];
    }
  }

  if (upsertedIds.length > 0) {
    await deleteGameData("game_platforms", "game_id", upsertedIds);
    await deleteGameData("game_tags", "game_id", upsertedIds);
    await deleteGameData("game_scores", "game_id", upsertedIds);
    await deleteGameData("game_age_ratings", "game_id", upsertedIds);
  }

  if (platformRows.length > 0) {
    await deleteAndInsert("game_platforms", platformRows);
  }
  if (tagRows.length > 0) {
    await deleteAndInsert("game_tags", tagRows);
  }
  if (scoreRows.length > 0) {
    await upsertBatch("game_scores", scoreRows, "game_id, platform_id, score_source, source_key");
  }
  if (ageRatingRows.length > 0) {
    await upsertBatch("game_age_ratings", ageRatingRows, "game_id, platform_id, rating_board, source, source_key");
  }

  return gameRows.map((r) => r.game_id);
}

async function processDetailBatch(games) {
  const aliasRows = [];
  const companyRows = [];
  const summaryRows = [];
  const releaseRows = [];
  const platformScoreRows = [];
  const externalIdRows = [];

  for (const game of games) {
    aliasRows.push(...game.aliases);
    companyRows.push(...game.companies);
    summaryRows.push(...game.summaries);
    releaseRows.push(...game.releases);
    platformScoreRows.push(...game.platformScores);
    externalIdRows.push(...game.externalIds);
  }

  if (aliasRows.length > 0) {
    const gameIds = [...new Set(aliasRows.map((r) => r.game_id))];
    await deleteGameData("game_aliases", "game_id", gameIds);
    await deleteAndInsert("game_aliases", aliasRows);
  }
  if (companyRows.length > 0) {
    await upsertBatch("game_companies", companyRows, "game_id, company_name, role, source");
  }
  if (summaryRows.length > 0) {
    await upsertBatch("game_summaries", summaryRows, "game_id, source, source_key");
  }
  if (releaseRows.length > 0) {
    await upsertBatch("game_releases", releaseRows, "game_id, platform_id, source, source_key");
  }
  if (platformScoreRows.length > 0) {
    await upsertBatch("game_scores", platformScoreRows, "game_id, platform_id, score_source, source_key");
  }
  if (externalIdRows.length > 0) {
    await upsertBatch("game_external_ids", externalIdRows, "game_id, provider, provider_game_key");
  }
}

async function main() {
  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) {
    console.error("RAWG_API_KEY env var required");
    process.exit(1);
  }

  const isIncremental = process.argv.includes("--incremental");
  const skipDetail = process.argv.includes("--no-detail");
  const yearsBack = parseInt(
    process.argv.find((a) => a.startsWith("--years="))?.split("=")[1] || "27",
    10,
  );

  console.error(`Mode: ${isIncremental ? "incremental" : "full"}${skipDetail ? " (no detail)" : ""}`);
  console.error("Loading existing data...");
  const { ids, titles, byRawgId, hasSummary } = await loadExistingGames();
  const seenIds = new Set(ids);
  const seenTitles = new Set(titles);
  console.error(`  ${seenIds.size} games, ${hasSummary.size} with summaries`);

  const progress = loadProgress();
  if (!progress.detailProcessed) progress.detailProcessed = {};
  if (!progress.detailQueue) progress.detailQueue = [];

  let newGameIds = [];
  let phase1Total = 0;

  if (!isIncremental) {
    const currentYear = new Date().getFullYear();
    const startYear = Math.max(currentYear - yearsBack + 1, 2000);
    const years = [];
    for (let y = currentYear; y >= startYear; y--) years.push(y);

    for (const year of years) {
      console.error(`\n=== Year ${year} ===`);
      const games = await fetchYearGames(apiKey, year);
      console.error(`  Fetched ${games.length} games`);

      const { newGames, updatedGames } = dedupGames(games, seenTitles, seenIds, byRawgId);
      const toProcess = [...newGames, ...updatedGames];

      if (toProcess.length === 0) {
        console.error(`  0 to process`);
        continue;
      }

      console.error(`  ${newGames.length} new, ${updatedGames.length} to update`);

      const uuids = await processListBatch(toProcess, byRawgId);
      newGameIds.push(...uuids);
      phase1Total += uuids.length;
      console.error(`  Upserted ${uuids.length} games`);
    }

    for (const platformId of RETRO_PLATFORMS) {
      const p = RAWG_PLATFORMS[platformId];
      if (!p) continue;
      console.error(`\n=== ${p.name} (retro) ===`);
      const games = await fetchPlatformGames(apiKey, p.id);
      console.error(`  Fetched ${games.length} games`);

      const { newGames, updatedGames } = dedupGames(games, seenTitles, seenIds, byRawgId);
      const toProcess = [...newGames, ...updatedGames];

      if (toProcess.length === 0) {
        console.error(`  0 to process`);
        continue;
      }

      console.error(`  ${newGames.length} new, ${updatedGames.length} to update`);
      const uuids = await processListBatch(toProcess, byRawgId);
      newGameIds.push(...uuids);
      phase1Total += uuids.length;
      console.error(`  Upserted ${uuids.length} games`);
    }

    console.error(`\n=== Phase 1 done: ${phase1Total} games processed ===`);
  }

  if (skipDetail) {
    console.error("Skipping phase 2 (detail fetch)");
    return;
  }

  console.error("\n=== Phase 2: Detail fetch ===");
  const apiGameIds = [...byRawgId.entries()].filter(
    ([ref]) => !hasSummary.has(byRawgId.get(ref)) || !progress.detailProcessed[ref],
  );

  apiGameIds.sort((a, b) => {
    const aScore = parseInt(a[0].split(":")[1], 10);
    const bScore = parseInt(b[0].split(":")[1], 10);
    return aScore - bScore;
  });

  const gameIdsToFetch = apiGameIds.slice(0, 500);
  console.error(`  Queue: ${gameIdsToFetch.length} games (${apiGameIds.length} total pending)`);

  let detailBatch = [];
  let detailTotal = 0;

  for (const [ref, gameId] of gameIdsToFetch) {
    const rawgId = ref.replace("rawg:", "");
    const detail = await fetchRawgDetail(apiKey, rawgId);
    if (!detail) {
      await sleep(API_DELAY_MS);
      continue;
    }

    progress.detailProcessed[ref] = true;

    const aliases = toAliasRows(gameId, detail);
    const companies = toCompanyRows(gameId, detail);
    const summaries = toSummaryRows(gameId, detail);
    const releases = toReleaseRows(gameId, detail);
    const platformScores = toPlatformScoreRows(gameId, detail);
    const externalIds = toExternalIdRows(gameId, detail);

    detailBatch.push({
      gameId,
      aliases,
      companies,
      summaries,
      releases,
      platformScores,
      externalIds,
    });
    detailTotal++;
    hasSummary.add(gameId);

    if (detailBatch.length >= FLUSH_BATCH) {
      await processDetailBatch(detailBatch);
      console.error(`  Detail batch flushed (${detailTotal} processed)`);
      detailBatch = [];
      saveProgress(progress);
    }

    await sleep(API_DELAY_MS);
  }

  if (detailBatch.length > 0) {
    await processDetailBatch(detailBatch);
    console.error(`  Final detail batch flushed (${detailTotal} total)`);
    saveProgress(progress);
  }

  console.error(`\n=== Done ===`);
  console.error(`  Phase 1: ${phase1Total} games`);
  console.error(`  Phase 2: ${detailTotal} details fetched`);
}

main().catch(console.error);
