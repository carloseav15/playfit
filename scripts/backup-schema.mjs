// Backs up a Postgres schema from the local Supabase DB to an external
// drive, so a `supabase db reset` never forces redoing expensive data work
// (the multi-hour IGDB mirror crawl in scripts/sync-igdb-mirror.mjs, or the
// cross-source catalog backfills in games_library). Schema *structure*
// already lives in supabase/migrations/; this only backs up the data.
//
// Usage:
//   node scripts/backup-schema.mjs --schema <name> [--out <dir>]
//
// Writes a timestamped pg_dump (custom format) to
// <dir>/<schema>_<timestamp>.dump. <dir> defaults to
// PLAYFIT_BACKUP_ROOT/<schema> (PLAYFIT_BACKUP_ROOT defaults to
// /Volumes/Elements/Backups - external drive, several-GB dumps must never
// be committed to git).
//
// Restore with scripts/restore-schema.mjs --schema <name>.
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import process from "node:process";

const DEFAULT_BACKUP_ROOT = process.env.PLAYFIT_BACKUP_ROOT ?? "/Volumes/Elements/Playfit/Backups";

function parseArgs(argv) {
  const args = { schema: null, out: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--schema") args.schema = argv[++index];
    else if (argv[index] === "--out") args.out = argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!args.schema) throw new Error("--schema <name> is required");
  if (!args.out) args.out = `${DEFAULT_BACKUP_ROOT}/${args.schema}`;
  return args;
}

function dbContainerName() {
  const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
  const match = config.match(/^project_id\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("Could not read project_id from supabase/config.toml");
  return `supabase_db_${match[1]}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const container = dbContainerName();

  if (!existsSync(args.out)) {
    mkdirSync(args.out, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destPath = `${args.out}/${args.schema}_${timestamp}.dump`;
  console.log(`Backing up schema '${args.schema}' from ${container} to ${destPath} ...`);

  const dest = createWriteStream(destPath);
  const child = spawn(
    "docker",
    [
      "exec",
      container,
      "pg_dump",
      "-U",
      "postgres",
      "-d",
      "postgres",
      `--schema=${args.schema}`,
      "--format=custom",
      "--no-owner",
      "--no-privileges",
    ],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  child.stdout.pipe(dest);

  try {
    await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`pg_dump exited with code ${code}`));
      });
    });
  } catch (error) {
    dest.close();
    if (existsSync(destPath)) unlinkSync(destPath);
    throw error;
  }

  await new Promise((resolve) => dest.close(resolve));
  const sizeMb = (statSync(destPath).size / (1024 * 1024)).toFixed(1);
  console.log(`Backup complete: ${destPath} (${sizeMb} MB)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
