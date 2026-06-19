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

async function main() {
  // Load all games
  const all = [];
  let from = 0;
  const pageSize = 1000;
  let done = false;
  while (!done) {
    const { data } = await supabase.from("games").select("game_id, title, source_type").range(from, from + pageSize - 1);
    all.push(...(data ?? []));
    from += pageSize;
    if ((data ?? []).length < pageSize) done = true;
  }

  console.log("Total games:", all.length);

  // Build a map of normalized title -> all games with that title
  const titleMap = new Map();
  for (const g of all) {
    const key = normalize(g.title);
    if (!titleMap.has(key)) titleMap.set(key, []);
    titleMap.get(key).push(g);
  }

  // Find catalog-source games that have a non-catalog counterpart
  const toDelete = [];

  for (const [key, games] of titleMap) {
    const catalogGame = games.find(g => g.source_type === "catalog");
    const nonCatalog = games.filter(g => g.source_type !== "catalog");

    if (catalogGame && nonCatalog.length > 0) {
      toDelete.push(catalogGame);
    }
  }

  console.log(`\nCatalog-source games to DELETE: ${toDelete.length}`);

  // Also find catalog-source games that are unique (no counterpart)
  const uniqueCatalog = [];
  for (const [key, games] of titleMap) {
    const catalogGame = games.find(g => g.source_type === "catalog");
    const nonCatalog = games.filter(g => g.source_type !== "catalog");
    if (catalogGame && nonCatalog.length === 0) {
      uniqueCatalog.push(catalogGame);
    }
  }
  console.log(`Unique catalog-source games to KEEP: ${uniqueCatalog.length}`);

  const apply = process.argv.includes("--apply");
  if (!apply) {
    console.log("\nDry run. Re-run with --apply to write changes.");
    return;
  }

  // Delete duplicate catalog-source games
  if (toDelete.length > 0) {
      console.log(`\nDeleting ${toDelete.length} duplicate catalog-source games...`);
    const BATCH = 100;
    for (let i = 0; i < toDelete.length; i += BATCH) {
      const batch = toDelete.slice(i, i + BATCH);
      const ids = batch.map(g => g.game_id);
      const { error } = await supabase.from("games").delete().in("game_id", ids);
      if (error) console.error(`  Error: ${error.message}`);
      else console.log(`  Batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(toDelete.length / BATCH)} OK`);
    }
  }

  console.log("\n=== Done ===");
}

main().catch(console.error);
