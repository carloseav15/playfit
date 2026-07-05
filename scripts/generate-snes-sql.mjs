import { readFileSync, writeFileSync } from "node:fs";

const APPLY_FILE = new URL("../reports/gamesdatabase-snes-apply.json", import.meta.url);
const OUT_FILE = new URL("../supabase/migrations/20260703010000_backfill_snes_from_gamesdatabase.sql", import.meta.url);

function slugifySourceKey(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function main() {
  const data = JSON.parse(readFileSync(APPLY_FILE, "utf8"));
  const withGenre = data.filter((r) => r.apply_genre);
  const withDevPub = data.filter((r) => r.apply_developer || r.apply_publisher);

  const lines = [];
  lines.push("-- Enriches SNES games with data scraped from gamesdatabase.org (robots.txt");
  lines.push("-- explicitly allows crawling: \"Allow: /\").");
  lines.push(`-- ${data.length} SNES game pages scraped, matched to our catalog by exact`);
  lines.push("-- normalized title. Rows where the site's year and our existing release_year");
  lines.push("-- differ by more than 3 years were excluded beforehand as likely title");
  lines.push("-- collisions with an unrelated game sharing the same name.");
  lines.push("--");
  lines.push("-- Category strings were mapped to our controlled genre vocabulary");
  lines.push("-- conservatively: exact compound match first, else first segment against the");
  lines.push("-- base genre set; anything ambiguous was left unmapped.");
  lines.push("--");
  lines.push("-- Idempotent: genre only applies where genre_id is still null; company");
  lines.push("-- rows use ON CONFLICT DO NOTHING against the existing per-source unique");
  lines.push("-- constraint, so re-running is a safe no-op.");
  lines.push("begin;");
  lines.push("");

  // Genre backfill
  if (withGenre.length > 0) {
    lines.push("with backfill(game_id, genre_id) as (");
    lines.push("  values");
    for (let i = 0; i < withGenre.length; i++) {
      const r = withGenre[i];
      const comma = i < withGenre.length - 1 ? "," : "";
      lines.push(`    ('${r.game_id}', '${r.apply_genre}')${comma}`);
    }
    lines.push(")");
    lines.push("update games_library.games g set genre_id = b.genre_id");
    lines.push("from backfill b");
    lines.push("where g.game_id = b.game_id and g.genre_id is null;");
    lines.push("");
  }

  // Game companies
  const companyRows = [];
  for (const r of withDevPub) {
    const sourceKey = slugifySourceKey(r.slug);
    if (r.apply_developer) {
      companyRows.push({ game_id: r.game_id, name: r.apply_developer, role: "developer", sourceKey });
    }
    if (r.apply_publisher) {
      companyRows.push({ game_id: r.game_id, name: r.apply_publisher, role: "publisher", sourceKey });
    }
  }

  if (companyRows.length > 0) {
    lines.push("insert into games_library.game_companies");
    lines.push("  (game_id, company_name, role, source, source_key)");
    lines.push("select");
    lines.push("  b.game_id, b.company_name, b.role, 'gamesdatabase'::text, b.source_key");
    lines.push("from ( values");
    for (let i = 0; i < companyRows.length; i++) {
      const r = companyRows[i];
      const comma = i < companyRows.length - 1 ? "," : "";
      lines.push(`    ('${r.game_id}', '${r.name.replace(/'/g, "''")}', '${r.role}', '${r.sourceKey}')${comma}`);
    }
    lines.push(") as b(game_id, company_name, role, source_key)");
    lines.push("on conflict (game_id, company_name, role, source) do nothing;");
    lines.push("");
  }

  lines.push("commit;");

  writeFileSync(OUT_FILE, lines.join("\n"));
  console.log(`Wrote ${OUT_FILE.pathname}`);
  console.log(`  Genre updates: ${withGenre.length}`);
  console.log(`  Company rows: ${companyRows.length}`);
}

main();
