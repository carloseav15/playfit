import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

const root = process.env.PLAYFIT_BACKUP_ROOT ?? "/Volumes/Elements/Playfit/Backups";
const retentionDays = Number(process.env.PLAYFIT_BACKUP_RETENTION_DAYS ?? 30);
const groups = ["games_library", "games_library_private", "igdb_raw", "runtime_catalog"];

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))));
  });
}

async function rotateGroup(group) {
  const directory = join(root, group);
  const files = (await readdir(directory))
    .filter((name) => name.endsWith(".dump"))
    .map(async (name) => ({ name, modified: (await stat(join(directory, name))).mtimeMs }))
    .map((promise) => promise);
  const sorted = (await Promise.all(files)).sort((a, b) => b.modified - a.modified);
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const newest = sorted[0];
  for (const file of sorted.slice(1)) {
    if (file.modified < cutoff) {
      await unlink(join(directory, file.name));
      console.log(`ROTATED ${group}/${file.name}`);
    }
  }
  if (newest) console.log(`KEPT newest ${group}/${newest.name}`);
}

await run("npm", ["run", "backup:all"]);
await run("npm", ["run", "backup:runtime-catalog"]);
await run("npm", ["run", "backup:verify"]);
for (const group of groups) await rotateGroup(group);
