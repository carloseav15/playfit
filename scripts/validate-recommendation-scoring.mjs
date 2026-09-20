import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const fullCatalog = process.argv.includes("--full-catalog");
if (process.argv.slice(2).some((arg) => arg !== "--full-catalog")) throw new Error("Unknown argument");

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const oldMigration = read("supabase/migrations/20260820160009_reorder_score_today_recommendations_candidates.sql");
const oldFunction = oldMigration.slice(oldMigration.indexOf("create or replace function"), oldMigration.indexOf("\ncommit;"))
  .replace("games_library.score_today_recommendations(", "pg_temp.previous_score_today_recommendations(");
const migration = read("supabase/migrations/20260912204151_share_recommendation_scoring.sql")
  .replace("\nbegin;", "").replace("\ncommit;", "");
let functions = `${oldFunction}\n${migration}`;
if (!fullCatalog) for (const [source, target] of Object.entries({
  "games_library.games": "pg_temp.review_games",
  "games_library.game_platforms": "pg_temp.review_platforms",
  "games_library.game_quality_score": "pg_temp.review_quality",
  "games_library.series": "pg_temp.review_series",
})) functions = functions.replaceAll(source, target);
const setup = fullCatalog ? "" : read("supabase/tests/recommendation-scoring-fixtures.sql");
const checks = read(fullCatalog ? "supabase/tests/recommendation-scoring-catalog.sql" : "supabase/tests/recommendation-scoring-assertions.sql");
const sql = `begin;\nset local statement_timeout = '${fullCatalog ? "60s" : "30s"}';\n${setup}\n${functions}\n${checks}\nrollback;`;
// Uses the local Docker database only. No credential or remote connection is read.
const result = spawnSync("docker", ["exec", "-i", "supabase_db_games-library", "psql", "-X", "-w", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
  input: sql, encoding: "utf8", timeout: fullCatalog ? 240_000 : 120_000,
});
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.error) process.stderr.write(`${result.error.message}\n`);
process.exitCode = result.status === 0 && !result.error ? 0 : 1;
