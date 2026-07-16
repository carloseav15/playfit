// Loads the latest external runtime catalog after the production-contract
// migrations have created the trimmed schema.
import { spawn } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";

const BACKUP_ROOT = process.env.PLAYFIT_BACKUP_ROOT ?? "/Volumes/Elements/Playfit/Backups";
const DB_USER = process.env.PLAYFIT_DB_USER ?? "postgres";

function dbContainerName() {
  if (process.env.PLAYFIT_DB_CONTAINER) return process.env.PLAYFIT_DB_CONTAINER;
  const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
  const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  if (!projectId) throw new Error("Could not read project_id from supabase/config.toml");
  return `supabase_db_${projectId}`;
}

function latestCatalog() {
  const dir = `${BACKUP_ROOT}/runtime_catalog`;
  const candidates = readdirSync(dir)
    .filter((name) => name.startsWith("runtime_catalog_") && name.endsWith(".dump"))
    .map((name) => `${dir}/${name}`)
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  if (candidates.length === 0) throw new Error(`No runtime catalog dump found in ${dir}`);
  return candidates[0];
}

function runPsql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      ["exec", dbContainerName(), "psql", "-U", DB_USER, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql],
      { stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`psql exited with code ${code}`))));
  });
}

const GAME_SYNC_TRIGGERS = `
  alter table games_library.games disable trigger games_aliases_array_sync;
  alter table games_library.games disable trigger games_platforms_array_sync;
  alter table games_library.games disable trigger games_tags_array_sync;
`;

const ENABLE_GAME_SYNC_TRIGGERS = `
  alter table games_library.games enable trigger games_aliases_array_sync;
  alter table games_library.games enable trigger games_platforms_array_sync;
  alter table games_library.games enable trigger games_tags_array_sync;
`;

async function main() {
  const source = process.argv[2] ?? latestCatalog();
  console.log(`Restoring runtime catalog from ${source} ...`);
  await runPsql(GAME_SYNC_TRIGGERS);
  try {
    const child = spawn(
      "docker",
      [
        "exec",
        "-i",
        dbContainerName(),
        "pg_restore",
        "-U",
        DB_USER,
        "-d",
        "postgres",
        "--data-only",
        "--exit-on-error",
        "--no-owner",
        "--no-privileges",
      ],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    const { createReadStream } = await import("node:fs");
    createReadStream(source).pipe(child.stdin);
    await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`pg_restore exited with code ${code}`))));
    });
  } finally {
    await runPsql(ENABLE_GAME_SYNC_TRIGGERS);
  }
  console.log("Runtime catalog restore complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
