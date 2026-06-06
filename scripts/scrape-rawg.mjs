import { createClient } from "@supabase/supabase-js";

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
  return `rawg_${safe}`;
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

async function fetchYearPlatform(apiKey, rawgId, year, ordering = "-rating", pageSize = 20) {
  const dates = `${year}-01-01,${year}-12-31`;
  const url = `https://api.rawg.io/api/games?key=${apiKey}&platforms=${rawgId}&dates=${dates}&page_size=${pageSize}&ordering=${ordering}`;

  const response = await fetch(url);
  if (!response.ok) {
    console.error(`  HTTP ${response.status}`);
    return [];
  }
  const data = await response.json();
  return data.results || [];
}

async function fetchPlatformPage(apiKey, rawgId, page, ordering = "-rating", pageSize = 40) {
  const url = `https://api.rawg.io/api/games?key=${apiKey}&platforms=${rawgId}&page=${page}&page_size=${pageSize}&ordering=${ordering}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`  HTTP ${response.status}`);
      return [];
    }
    const data = await response.json();
    return data.results || [];
  } catch (err) {
    console.error(`  Network error: ${err.message}`);
    return [];
  }
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

function toGameRow(game, platformIds, platformNames) {
  const gameId = makeGameId(game.name);
  const releaseYear = game.released ? game.released.slice(0, 4) : "";
  const released = game.released && game.released <= new Date().toISOString().slice(0, 10);
  const coverUrl = game.background_image || "";
  const tags = rawgToTags(game);
  const rawgGenres = (game.genres || []).map((g) => g.slug);

  const notes = [
    game.rating ? `RAWG Rating: ${game.rating}` : "",
    game.metacritic ? `Metacritic: ${game.metacritic}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  return {
    game_id: gameId,
    title: game.name,
    aliases: [],
    series: "",
    primary_genre: rawgGenres.join(";"),
    platforms: platformIds,
    platform_names: platformNames,
    release_year: releaseYear,
    release_state: released ? "released" : "unreleased",
    source_type: "finder",
    source_ref: `rawg:${game.id}`,
    cover_url: coverUrl,
    tags,
    notes,
    sort_date: "",
    release_label: "",
  };
}

async function loadExistingGames() {
  const ids = new Set();
  const titles = new Set();
  const pageSize = 1000;
  let from = 0;
  let done = false;

  while (!done) {
    const { data, error } = await supabase
      .from("games")
      .select("game_id, title")
      .range(from, from + pageSize - 1);

    if (error) {
      console.error("Error loading existing games:", error.message);
      return { ids, titles };
    }

    const batch = data ?? [];
    for (const g of batch) {
      if (g.game_id) ids.add(g.game_id);
      if (g.title) titles.add(normalizeTitle(g.title));
    }

    from += pageSize;
    if (batch.length < pageSize) done = true;
  }

  return { ids, titles };
}

async function upsertGames(rows) {
  if (rows.length === 0) return;
  const { error } = await supabase.from("games").upsert(rows, { onConflict: "game_id" });
  if (error) {
    console.error("Error upserting games:", error.message);
  } else {
    console.error(`  Upserted ${rows.length} games`);
  }
}

async function main() {
  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) {
    console.error("RAWG_API_KEY env var required");
    process.exit(1);
  }

  const years = [];
  for (let y = 2026; y >= 2000; y--) years.push(y);

  const modernPlatforms = [
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

  console.error("Loading existing games for dedup...");
  const existing = await loadExistingGames();
  console.error(`  ${existing.ids.size} IDs, ${existing.titles.size} titles`);

  const seenIds = new Set(existing.ids);
  const seenTitles = new Set(existing.titles);

  function isDuplicate(game) {
    const gid = makeGameId(game.name);
    const ntitle = normalizeTitle(game.name);
    if (seenIds.has(gid) || seenTitles.has(ntitle)) return true;
    return false;
  }

  function markSeen(game) {
    const gid = makeGameId(game.name);
    const ntitle = normalizeTitle(game.name);
    seenIds.add(gid);
    seenTitles.add(ntitle);
  }

  // -- Modern platforms (2026 → 2015) --
  for (const platformId of modernPlatforms) {
    const p = RAWG_PLATFORMS[platformId];
    if (!p) continue;
    console.error(`\n=== ${p.name} (${platformId}) ===`);

    const platformRows = [];

    for (const year of years) {
      console.error(`  ${year}...`);
      const games = await fetchYearPlatform(apiKey, p.id, year);

      let added = 0;
      for (const game of games) {
        if (isEasterEgg(game.released)) continue;
        if (isDuplicate(game)) continue;

        const otherPlatforms = [];
        const otherNames = [p.name];
        if (game.parent_platforms) {
          for (const pp of game.parent_platforms) {
            const slug = pp.platform.slug;
            for (const [pid, info] of Object.entries(RAWG_PLATFORMS)) {
              if (pid === platformId) continue;
              if (slug.includes("playstation") && info.name.includes("PlayStation")) {
                if (!otherPlatforms.includes(pid)) {
                  otherPlatforms.push(pid);
                  otherNames.push(info.name);
                }
              } else if (slug.includes("xbox") && info.name.includes("Xbox")) {
                if (!otherPlatforms.includes(pid)) {
                  otherPlatforms.push(pid);
                  otherNames.push(info.name);
                }
              } else if (slug.includes("nintendo-switch") && pid === "switch_1") {
                if (!otherPlatforms.includes(pid)) {
                  otherPlatforms.push(pid);
                  otherNames.push(info.name);
                }
              } else if (slug.includes("pc") && pid === "pc") {
                if (!otherPlatforms.includes(pid)) {
                  otherPlatforms.push(pid);
                  otherNames.push(info.name);
                }
              } else if ((slug === "macos" || slug === "mac") && pid === "macos") {
                if (!otherPlatforms.includes(pid)) {
                  otherPlatforms.push(pid);
                  otherNames.push(info.name);
                }
              } else if (slug.includes("ios") && pid === "ios") {
                if (!otherPlatforms.includes(pid)) {
                  otherPlatforms.push(pid);
                  otherNames.push(info.name);
                }
              } else if (slug.includes("android") && pid === "android") {
                if (!otherPlatforms.includes(pid)) {
                  otherPlatforms.push(pid);
                  otherNames.push(info.name);
                }
              } else if (slug.includes("linux") && pid === "linux") {
                if (!otherPlatforms.includes(pid)) {
                  otherPlatforms.push(pid);
                  otherNames.push(info.name);
                }
              }
            }
          }
        }

        const allPids = [platformId, ...otherPlatforms.filter((p) => p !== platformId)];
        const allNames = [p.name, ...otherNames.filter((n) => n !== p.name)];
        const row = toGameRow(game, allPids, allNames);
        platformRows.push(row);
        markSeen(game);
        added++;
      }
      console.error(`    +${added} games`);

      await sleep(800);
    }

    if (platformRows.length > 0) {
      await upsertGames(platformRows);
    }
  }

  // -- Modern platforms (ordering=-added, second pass) --
  for (const platformId of modernPlatforms) {
    const p = RAWG_PLATFORMS[platformId];
    if (!p) continue;
    console.error(`\n=== ${p.name} (${platformId}) [added] ===`);

    const platformRows = [];

    for (const year of years) {
      console.error(`  ${year}...`);
      const games = await fetchYearPlatform(apiKey, p.id, year, "-added");

      let added = 0;
      for (const game of games) {
        if (isEasterEgg(game.released)) continue;
        if (isDuplicate(game)) continue;

        const otherPlatforms = [];
        const otherNames = [p.name];
        if (game.parent_platforms) {
          for (const pp of game.parent_platforms) {
            const slug = pp.platform.slug;
            for (const [pid, info] of Object.entries(RAWG_PLATFORMS)) {
              if (pid === platformId) continue;
              if (slug.includes("playstation") && info.name.includes("PlayStation")) {
                if (!otherPlatforms.includes(pid)) {
                  otherPlatforms.push(pid);
                  otherNames.push(info.name);
                }
              } else if (slug.includes("xbox") && info.name.includes("Xbox")) {
                if (!otherPlatforms.includes(pid)) {
                  otherPlatforms.push(pid);
                  otherNames.push(info.name);
                }
              } else if (slug.includes("nintendo-switch") && pid === "switch_1") {
                if (!otherPlatforms.includes(pid)) {
                  otherPlatforms.push(pid);
                  otherNames.push(info.name);
                }
              } else if (slug.includes("pc") && pid === "pc") {
                if (!otherPlatforms.includes(pid)) {
                  otherPlatforms.push(pid);
                  otherNames.push(info.name);
                }
              } else if ((slug === "macos" || slug === "mac") && pid === "macos") {
                if (!otherPlatforms.includes(pid)) {
                  otherPlatforms.push(pid);
                  otherNames.push(info.name);
                }
              } else if (slug.includes("ios") && pid === "ios") {
                if (!otherPlatforms.includes(pid)) {
                  otherPlatforms.push(pid);
                  otherNames.push(info.name);
                }
              } else if (slug.includes("android") && pid === "android") {
                if (!otherPlatforms.includes(pid)) {
                  otherPlatforms.push(pid);
                  otherNames.push(info.name);
                }
              } else if (slug.includes("linux") && pid === "linux") {
                if (!otherPlatforms.includes(pid)) {
                  otherPlatforms.push(pid);
                  otherNames.push(info.name);
                }
              }
            }
          }
        }

        const allPids = [platformId, ...otherPlatforms.filter((p) => p !== platformId)];
        const allNames = [p.name, ...otherNames.filter((n) => n !== p.name)];
        const row = toGameRow(game, allPids, allNames);
        platformRows.push(row);
        markSeen(game);
        added++;
      }
      console.error(`    +${added} games`);
      await sleep(800);
    }

    if (platformRows.length > 0) {
      await upsertGames(platformRows);
    }
  }

  // -- Retro platforms (top-rated all-time, page-based) --
  const retroPlatforms = [
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

  let totalAdded = 0;

  for (const platformId of retroPlatforms) {
    const p = RAWG_PLATFORMS[platformId];
    if (!p) continue;
    console.error(`\n=== ${p.name} (${platformId}) ===`);

    const platformRows = [];

    for (let page = 1; page <= 50; page++) {
      console.error(`  page ${page}...`);
      const games = await fetchPlatformPage(apiKey, p.id, page, 40);

      let added = 0;
      for (const game of games) {
        if (isEasterEgg(game.released)) continue;
        if (isDuplicate(game)) continue;

        const allPids = [platformId];

        const row = toGameRow(game, allPids, [p.name]);
        platformRows.push(row);
        markSeen(game);
        added++;
      }
      console.error(`    +${added} games`);
      await sleep(800);
    }

    if (platformRows.length > 0) {
      await upsertGames(platformRows);
      totalAdded += platformRows.length;
    }
  }

  // -- Retro platforms (ordering=-added, second pass) --
  for (const platformId of retroPlatforms) {
    const p = RAWG_PLATFORMS[platformId];
    if (!p) continue;
    console.error(`\n=== ${p.name} (${platformId}) [added] ===`);

    const platformRows = [];

    for (let page = 1; page <= 50; page++) {
      console.error(`  page ${page}...`);
      const games = await fetchPlatformPage(apiKey, p.id, page, "-added", 40);

      let added = 0;
      for (const game of games) {
        if (isEasterEgg(game.released)) continue;
        if (isDuplicate(game)) continue;

        const allPids = [platformId];

        const row = toGameRow(game, allPids, [p.name]);
        platformRows.push(row);
        markSeen(game);
        added++;
      }
      console.error(`    +${added} games`);
      await sleep(800);
    }

    if (platformRows.length > 0) {
      await upsertGames(platformRows);
      totalAdded += platformRows.length;
    }
  }

  console.error(`\n=== Done: ${totalAdded} new games added ===`);
}

main().catch(console.error);
