// Saves only the anonymous/runtime catalog needed by the trimmed production
// schema. It deliberately excludes profiles, user state, audit logs and cache.
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from "node:fs";

const BACKUP_ROOT = process.env.PLAYFIT_BACKUP_ROOT ?? "/Volumes/Elements/Playfit/Backups";
const TABLES = [
  "platforms",
  "genres",
  "series",
  "tags",
  "games",
  "game_aliases",
  "game_platforms",
  "game_tags",
  "game_scores",
  "game_similar_games",
  "game_redirects",
  "tag_weights",
];

function dbContainerName() {
  const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
  const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  if (!projectId) throw new Error("Could not read project_id from supabase/config.toml");
  return `supabase_db_${projectId}`;
}

async function main() {
  const outDir = `${BACKUP_ROOT}/runtime_catalog`;
  mkdirSync(outDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = `${outDir}/runtime_catalog_${timestamp}.dump`;
  const args = [
    "exec",
    dbContainerName(),
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "--data-only",
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    ...TABLES.map((table) => `--table=games_library.${table}`),
  ];

  console.log(`Backing up runtime catalog to ${destination} ...`);
  const file = createWriteStream(destination);
  const child = spawn("docker", args, { stdio: ["ignore", "pipe", "inherit"] });
  child.stdout.pipe(file);

  try {
    await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`pg_dump exited with code ${code}`))));
    });
  } catch (error) {
    file.close();
    if (existsSync(destination)) unlinkSync(destination);
    throw error;
  }

  await new Promise((resolve) => file.close(resolve));
  console.log(`Runtime catalog backup complete (${(statSync(destination).size / 1024 / 1024).toFixed(1)} MB).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
