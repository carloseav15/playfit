import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_SERVICE_KEY required.");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: "games_library" },
});

function normalize(t) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Franchise definitions: series name → keyword patterns
// Patterns are checked as normalized substring matches against game titles
const FRANCHISES = [
  // Tier 1: big franchises with many games
  { series: "Sonic the Hedgehog", keywords: ["sonic the hedgehog", "sonic adventure", "sonic heroes", "sonic unleashed", "sonic colors", "sonic generations", "sonic lost world", "sonic mania", "sonic frontiers", "sonic forces", "sonic rush", "sonic riders", "sonic battle", "sonic and", "sonic cd", "sonic.exe", "sonic boom", "sonic origin", "sonic superstars", "sonic dream team", "sonix", "tails", "knuckles", "shadow the hedgehog", "shadow generations"], exclude: ["sonic.exe"] },
  { series: "Mega Man", keywords: ["mega man", "megaman", "megaman zero", "megaman battle", "megaman x", "megaman zx", "rockman", "megamania"] },
  { series: "Street Fighter", keywords: ["street fighter", "super street fighter", "streetfighter"] },
  { series: "Tomb Raider", keywords: ["tomb raider"] },
  { series: "Mortal Kombat", keywords: ["mortal kombat", "ultimate mortal kombat"] },
  { series: "Tekken", keywords: ["tekken"] },

  // Tier 2: well-known franchises
  { series: "Monster Hunter", keywords: ["monster hunter"] },
  { series: "Yakuza", keywords: ["like a dragon", "yakuza 0", "yakuza kiwami", "yakuza 3", "yakuza 4", "yakuza 5", "yakuza 6", "yakuza: like a dragon", "yakuza 2", "yakuza (2005)", "kurohyo", "fist of the north star lost paradise"], exclude: ["nyakuza", "jak", "jack", "jake"] },
  { series: "Castlevania", keywords: ["castlevania"] },
  { series: "Hitman", keywords: ["hitman"], exclude: ["katekyo", "reborn", "hitman reborn", "reborn hitman"] },
  { series: "Dragon Age", keywords: ["dragon age"] },
  { series: "Crash Bandicoot", keywords: ["crash bandicoot", "crash team racing", "crash bash", "crash nitro", "crash twinsanity", "crash wrath"] },
  { series: "Spyro the Dragon", keywords: ["spyro"] },
  { series: "Ratchet & Clank", keywords: ["ratchet", "ratchet and clank", "ratchet and clank"] },
  { series: "Half-Life", keywords: ["half-life", "half life", "halflife"] },
  { series: "Portal", keywords: ["portal"], exclude: ["warcraft", "beyond the portal", "spectrobes", "portals", "war story", "beyond portal", "dark portal"] },
  { series: "Wolfenstein", keywords: ["wolfenstein"] },
  { series: "Dishonored", keywords: ["dishonored"] },
  { series: "Max Payne", keywords: ["max payne"] },
  { series: "Dead Rising", keywords: ["dead rising"] },
  { series: "Fatal Frame", keywords: ["fatal frame"] },
  { series: "Life is Strange", keywords: ["life is strange"] },

  // Tier 3: smaller/specific franchises
  { series: "The Last of Us", keywords: ["the last of us"] },
  { series: "Ghost of Tsushima", keywords: ["ghost of tsushima"] },
  { series: "NieR", keywords: ["nier", "nier:", "nierautomata", "nier replicant", "nier gestalt"], exclude: ["niere"] },
  { series: "Xenoblade Chronicles", keywords: ["xenoblade"] },
  { series: "Splatoon", keywords: ["splatoon"] },
  { series: "Animal Crossing", keywords: ["animal crossing"] },
  { series: "Bayonetta", keywords: ["bayonetta"] },

  // Tier 4: fighting games
  { series: "Guilty Gear", keywords: ["guilty gear"] },
  { series: "BlazBlue", keywords: ["blazblue", "blaz blue"] },
  { series: "The King of Fighters", keywords: ["king of fighters"] },

  // Tier 5: classic arcade franchises
  { series: "Metal Slug", keywords: ["metal slug", "metal slug"] },
  { series: "Contra", keywords: ["contra", "super contra"], exclude: ["contraband"] },
  { series: "Ninja Gaiden", keywords: ["ninja gaiden", "ninja gaiden"] },

  // Tier 6: PC strategy
  { series: "Civilization", keywords: ["civilization", "sid meier", "civ "], exclude: ["civilization.exe", "ffciv"] },
  { series: "Age of Empires", keywords: ["age of empires", "age of mythology", "age of kings"] },
  { series: "XCOM", keywords: ["xcom", "x-com", "x com"] },
  { series: "Warcraft", keywords: ["warcraft", "world of warcraft", "hearthstone", "heroes of the storm"], exclude: ["warcraft arclight"] },
  { series: "StarCraft", keywords: ["starcraft", "star craft", "star craft"] },

  // Tier 7: Telltale / narrative
  { series: "The Walking Dead", keywords: ["the walking dead", "walking dead"], exclude: ["overkill"] },
];

const APPLY = process.argv.includes("--apply");

async function ensureSeries(seriesName) {
  const seriesId = seriesName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  const { error } = await supabase.from("series").upsert(
    { id: seriesId, name: seriesName },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) console.error(`  Error ensuring series "${seriesName}": ${error.message}`);
  return seriesId;
}

async function updateWithSeries(gameId, series) {
  if (!APPLY) return;
  const seriesId = await ensureSeries(series);
  const { error } = await supabase
    .from("games")
    .update({ series_id: seriesId })
    .eq("game_id", gameId);
  if (error) console.error(`  Error updating ${gameId}: ${error.message}`);
}

async function main() {
  const all = [];
  let from = 0;
  const pageSize = 1000;
  let done = false;
  while (!done) {
    const { data } = await supabase.from("games").select("game_id, title, series_id").range(from, from + pageSize - 1);
    all.push(...(data ?? []));
    from += pageSize;
    if ((data ?? []).length < pageSize) done = true;
  }
  console.log(`Total games in DB: ${all.length}`);

  let totalUpdated = 0;
  const seriesCounts = {};

  for (const franchise of FRANCHISES) {
    const { series, keywords, exclude = [] } = franchise;
    const toUpdate = [];

    for (const game of all) {
      if (game.series_id) continue; // already has a series
      const nt = normalize(game.title);
      const kwMatch = keywords.some(kw => nt.includes(normalize(kw)));
      if (!kwMatch) continue;
      const exMatch = exclude.some(ex => nt.includes(normalize(ex)));
      if (exMatch) continue;
      toUpdate.push(game);
    }

    if (toUpdate.length > 0) {
      seriesCounts[series] = toUpdate.length;
      const BATCH = 100;
      for (let i = 0; i < toUpdate.length; i += BATCH) {
        const batch = toUpdate.slice(i, i + BATCH);
        await Promise.all(batch.map(g => updateWithSeries(g.game_id, series)));
      }
      totalUpdated += toUpdate.length;
      console.log(`  ${series}: ${toUpdate.length} games updated`);
    }
  }

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write to database.");
    return;
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total games updated: ${totalUpdated}`);
  console.log(`Series assigned:`);
  for (const [s, c] of Object.entries(seriesCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c.toString().padStart(4)} → ${s}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
