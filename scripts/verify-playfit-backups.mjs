// Fast integrity check for every recoverable external Playfit dump.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";

const root = process.env.PLAYFIT_BACKUP_ROOT ?? "/Volumes/Elements/Playfit/Backups";
const groups = ["games_library", "games_library_private", "igdb_raw", "runtime_catalog"];

function newestDump(group) {
  const directory = `${root}/${group}`;
  if (!existsSync(directory)) throw new Error(`Missing backup directory: ${directory}`);
  const candidates = readdirSync(directory)
    .filter((name) => name.endsWith(".dump"))
    .map((name) => `${directory}/${name}`)
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  if (candidates.length === 0) throw new Error(`No dump found in ${directory}`);
  return candidates[0];
}

for (const group of groups) {
  const dump = newestDump(group);
  const relative = dump.replace("/Volumes/Elements/Playfit/", "");
  const result = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "--entrypoint",
      "pg_restore",
      "-v",
      "/Volumes/Elements/Playfit:/backups:ro",
      "public.ecr.aws/supabase/postgres:17.6.1.127",
      "--list",
      `/backups/${relative}`,
    ],
    { stdio: "ignore" },
  );
  if (result.status !== 0) throw new Error(`Unreadable dump: ${dump}`);
  console.log(`OK ${group}: ${dump}`);
}
