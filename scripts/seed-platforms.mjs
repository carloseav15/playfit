// Seed all known platforms with metadata into the database.
// Run: node scripts/seed-platforms.mjs

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  throw new Error("SUPABASE_SERVICE_KEY is required.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: "games_library" },
});

const PLATFORMS = [
  { id: "switch_2",        name: "Nintendo Switch 2",     rawg_id: null,    family: "nintendo",    vendor: "Nintendo",   kind: "hybrid",    gen: 10 },
  { id: "ps5",             name: "PlayStation 5",          rawg_id: 187,    family: "playstation", vendor: "Sony",        kind: "console",   gen: 9 },
  { id: "xbox_series_xs",  name: "Xbox Series X|S",        rawg_id: 186,    family: "xbox",        vendor: "Microsoft",  kind: "console",   gen: 9 },
  { id: "switch_1",        name: "Nintendo Switch",        rawg_id: 7,      family: "nintendo",    vendor: "Nintendo",   kind: "hybrid",    gen: 9 },
  { id: "ps4",             name: "PlayStation 4",          rawg_id: 18,     family: "playstation", vendor: "Sony",        kind: "console",   gen: 8 },
  { id: "xbox_one",        name: "Xbox One",               rawg_id: 1,      family: "xbox",        vendor: "Microsoft",  kind: "console",   gen: 8 },
  { id: "wii_u",           name: "Wii U",                  rawg_id: 10,     family: "nintendo",    vendor: "Nintendo",   kind: "console",   gen: 8 },
  { id: "3ds",             name: "Nintendo 3DS",           rawg_id: 8,      family: "nintendo",    vendor: "Nintendo",   kind: "handheld",  gen: 8 },
  { id: "ps_vita",         name: "PS Vita",                rawg_id: 19,     family: "playstation", vendor: "Sony",        kind: "handheld",  gen: 8 },
  { id: "ps3",             name: "PlayStation 3",          rawg_id: 16,     family: "playstation", vendor: "Sony",        kind: "console",   gen: 7 },
  { id: "xbox_360",        name: "Xbox 360",               rawg_id: 14,     family: "xbox",        vendor: "Microsoft",  kind: "console",   gen: 7 },
  { id: "wii",             name: "Wii",                    rawg_id: 11,     family: "nintendo",    vendor: "Nintendo",   kind: "console",   gen: 7 },
  { id: "psp",             name: "PSP",                    rawg_id: 17,     family: "playstation", vendor: "Sony",        kind: "handheld",  gen: 7 },
  { id: "ds",              name: "Nintendo DS",            rawg_id: 9,      family: "nintendo",    vendor: "Nintendo",   kind: "handheld",  gen: 7 },
  { id: "ps2",             name: "PlayStation 2",          rawg_id: 15,     family: "playstation", vendor: "Sony",        kind: "console",   gen: 6 },
  { id: "gamecube",        name: "GameCube",               rawg_id: 105,    family: "nintendo",    vendor: "Nintendo",   kind: "console",   gen: 6 },
  { id: "gba",             name: "Game Boy Advance",       rawg_id: 24,     family: "nintendo",    vendor: "Nintendo",   kind: "handheld",  gen: 6 },
  { id: "dreamcast",       name: "Dreamcast",              rawg_id: 106,    family: "sega",        vendor: "SEGA",       kind: "console",   gen: 6 },
  { id: "xbox_original",   name: "Xbox",                   rawg_id: 80,     family: "xbox",        vendor: "Microsoft",  kind: "console",   gen: 6 },
  { id: "ps1",             name: "PlayStation",            rawg_id: 27,     family: "playstation", vendor: "Sony",        kind: "console",   gen: 5 },
  { id: "n64",             name: "Nintendo 64",            rawg_id: 83,     family: "nintendo",    vendor: "Nintendo",   kind: "console",   gen: 5 },
  { id: "saturn",          name: "SEGA Saturn",            rawg_id: 107,    family: "sega",        vendor: "SEGA",       kind: "console",   gen: 5 },
  { id: "snes",            name: "SNES",                   rawg_id: 79,     family: "nintendo",    vendor: "Nintendo",   kind: "console",   gen: 4 },
  { id: "genesis",         name: "Genesis",                rawg_id: 167,    family: "sega",        vendor: "SEGA",       kind: "console",   gen: 4 },
  { id: "gbc",             name: "Game Boy Color",         rawg_id: 43,     family: "nintendo",    vendor: "Nintendo",   kind: "handheld",  gen: 4 },
  { id: "nes",             name: "NES",                    rawg_id: 49,     family: "nintendo",    vendor: "Nintendo",   kind: "console",   gen: 3 },
  { id: "gb",              name: "Game Boy",               rawg_id: 26,     family: "nintendo",    vendor: "Nintendo",   kind: "handheld",  gen: 4 },
  { id: "pc",              name: "PC",                     rawg_id: 4,      family: "pc",          vendor: "PC",         kind: "computer",  gen: 0 },
  { id: "macos",           name: "macOS",                  rawg_id: 5,      family: "pc",          vendor: "Apple",       kind: "computer",  gen: 0 },
  { id: "ios",             name: "iOS",                    rawg_id: 3,      family: "apple",       vendor: "Apple",       kind: "other",     gen: 0 },
  { id: "android",         name: "Android",                rawg_id: 21,     family: "google",      vendor: "Google",     kind: "other",     gen: 0 },
  { id: "linux",           name: "Linux",                  rawg_id: 6,      family: "pc",          vendor: "Linux",      kind: "computer",  gen: 0 },
  { id: "sega_master_system", name: "SEGA Master System",  rawg_id: 74,     family: "sega",        vendor: "SEGA",       kind: "console",   gen: 3 },
  { id: "neo_geo",         name: "Neo Geo",                rawg_id: 12,     family: "snk",         vendor: "SNK",        kind: "console",   gen: 4 },
  { id: "game_gear",       name: "Game Gear",              rawg_id: 77,     family: "sega",        vendor: "SEGA",       kind: "handheld",  gen: 3 },
  { id: "atari_2600",      name: "Atari 2600",             rawg_id: 23,     family: "atari",       vendor: "Atari",      kind: "console",   gen: 2 },
];

async function main() {
  console.error(`Seeding ${PLATFORMS.length} platforms...`);

  const { error } = await supabase.from("platforms").upsert(PLATFORMS, {
    onConflict: "id",
    ignoreDuplicates: false,
  });

  if (error) {
    console.error("Error seeding platforms:", error.message);
    process.exit(1);
  }

  console.error("Done.");
}

main().catch(console.error);
