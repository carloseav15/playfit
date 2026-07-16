// Read-only catalog quality report. It never updates or deletes catalog rows.
// Usage: SUPABASE_SERVICE_KEY=... npm run catalog:quality-report
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";

const url =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const serviceKey = process.env.SUPABASE_SERVICE_KEY;
if (!serviceKey) throw new Error("SUPABASE_SERVICE_KEY is required.");

const supabase = createClient(url, serviceKey, { db: { schema: "games_library" } });
const pageSize = 1000;
const rows = [];

for (let from = 0; ; from += pageSize) {
  const { data, error } = await supabase
    .from("games")
    .select("game_id,title,genre_id,tags,release_year,source_ref,cover_url")
    .order("game_id")
    .range(from, from + pageSize - 1);
  if (error) throw new Error(error.message);
  rows.push(...data);
  if (data.length < pageSize) break;
}

function score(row) {
  return (
    (/^\p{L}/u.test(row.title) ? 20 : /^\p{N}/u.test(row.title) ? 12 : 0) +
    (row.cover_url ? 8 : 0) +
    (row.genre_id && row.genre_id !== "unknown" ? 4 : 0) +
    (row.tags?.length ? 4 : 0) +
    (row.release_year != null ? 2 : 0) +
    (row.source_ref ? 2 : 0)
  );
}

function flags(row) {
  const result = [];
  const title = row.title.toLowerCase();
  if (/^[^\p{L}\p{N}]/u.test(row.title)) result.push("leading_punctuation");
  if (/mw-parser-output|background-color:|<server error>/.test(title)) {
    result.push("probable_import_artifact");
  }
  if (/\b(demo|beta|casino slots|now on itch\.io)\b/.test(title)) {
    result.push("probable_demo_or_promo");
  }
  if (!row.cover_url) result.push("missing_cover");
  if (!row.genre_id || row.genre_id === "unknown") result.push("missing_genre");
  if (!row.tags?.length) result.push("missing_tags");
  if (row.release_year == null) result.push("missing_release_year");
  if (!row.source_ref) result.push("missing_source_ref");
  return result;
}

const flagged = rows
  .map((row) => ({ ...row, qualityScore: score(row), flags: flags(row) }))
  .filter((row) => row.flags.length > 0)
  .sort((left, right) => left.qualityScore - right.qualityScore || left.title.localeCompare(right.title));

mkdirSync(new URL("../reports/", import.meta.url), { recursive: true });
const output = new URL("../reports/catalog-quality.json", import.meta.url);
writeFileSync(
  output,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), total: rows.length, flagged }, null, 2)}\n`,
);

console.log(`Catalog rows: ${rows.length}`);
console.log(`Rows needing review: ${flagged.length}`);
console.log(`Report: ${output.pathname}`);
