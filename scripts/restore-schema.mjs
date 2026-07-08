// Restores a Postgres schema from a backup made by scripts/backup-schema.mjs.
// Use this after a `supabase db reset` wipes local data, instead of redoing
// the expensive data work (IGDB mirror crawl, catalog backfills, etc.).
//
// Usage:
//   node scripts/restore-schema.mjs --schema <name> [--file <path>] [--dir <dir>]
//
// Without --file, restores the newest <schema>_*.dump found in --dir
// (default: PLAYFIT_BACKUP_ROOT/<schema>, PLAYFIT_BACKUP_ROOT defaults to
// /Volumes/Elements/Backups).
import { spawn } from "node:child_process";
import { createReadStream, readFileSync, readdirSync, statSync } from "node:fs";
import process from "node:process";

const DEFAULT_BACKUP_ROOT = process.env.PLAYFIT_BACKUP_ROOT ?? "/Volumes/Elements/Backups";

function parseArgs(argv) {
  const args = { schema: null, file: null, dir: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--schema") args.schema = argv[++index];
    else if (argv[index] === "--file") args.file = argv[++index];
    else if (argv[index] === "--dir") args.dir = argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!args.schema) throw new Error("--schema <name> is required");
  if (!args.dir) args.dir = `${DEFAULT_BACKUP_ROOT}/${args.schema}`;
  return args;
}

function latestBackupIn(dir, schema) {
  const candidates = readdirSync(dir)
    .filter((name) => name.startsWith(`${schema}_`) && name.endsWith(".dump"))
    .map((name) => `${dir}/${name}`)
    .map((path) => ({ path, mtime: statSync(path).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (candidates.length === 0) throw new Error(`No ${schema}_*.dump files found in ${dir}`);
  return candidates[0].path;
}

function dbContainerName() {
  const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
  const match = config.match(/^project_id\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("Could not read project_id from supabase/config.toml");
  return `supabase_db_${match[1]}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = args.file ?? latestBackupIn(args.dir, args.schema);
  const container = dbContainerName();

  console.log(`Restoring schema '${args.schema}' into ${container} from ${file} ...`);
  console.log(
    "Runs with --clean --if-exists, so it's safe against an already-migrated (empty) schema.",
  );

  const child = spawn(
    "docker",
    [
      "exec",
      "-i",
      container,
      "pg_restore",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-privileges",
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  createReadStream(file).pipe(child.stdin);

  await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_restore exited with code ${code}`));
    });
  });

  if (args.schema === "games_library") {
    await refreshSearchDocument(container);
  }

  console.log("Restore complete.");
}

// games.search_document is `generated always as (...) stored`, computed from
// get_series_name()/get_genre_name() - functions marked immutable but which
// actually look up other tables. pg_restore doesn't guarantee genres/series
// are loaded before games (FK constraints are added after all data, so table
// load order isn't dependency-ordered), so the generated value can come out
// stale/incomplete right after restore. Force a full recompute now that
// every table in the schema is loaded.
async function refreshSearchDocument(container) {
  console.log("Refreshing games.search_document (depends on genres/series, restore order isn't guaranteed)...");
  await new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "exec",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-c",
        "UPDATE games_library.games SET game_id = game_id;",
      ],
      { stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`search_document refresh exited with code ${code}`));
    });
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
