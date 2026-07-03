// Downloads PS2 box art covers from psxdatacenter.com for games that matched
// our catalog (reports/psxdatacenter-apply.json) but currently have no
// cover_url. Cover images live at a predictable URL: images2/covers/{SERIAL}.jpg
// Saves into apps/web/public/covers/games/{game_id}.jpg (same layout as the
// rest of the covers directory) and writes a report of which game_ids got a
// cover, for building the DB migration afterwards.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const APPLY_FILE = new URL("../reports/psxdatacenter-apply.json", import.meta.url);
const MISSING_IDS_FILE = "/private/tmp/claude-501/-Users-carancibia-Projects-playfit/1d7a580e-06e2-486a-bb08-4bee589bdee0/scratchpad/missing_cover_game_ids.txt";
const COVERS_DIR = new URL("../apps/web/public/covers/games/", import.meta.url);
const OUT_FILE = new URL("../reports/psxdatacenter-covers-downloaded.json", import.meta.url);
const DELAY_MS = 300;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const missingIds = new Set(
    readFileSync(MISSING_IDS_FILE, "utf8").split("\n").map((s) => s.trim()).filter(Boolean),
  );
  const applyData = JSON.parse(readFileSync(APPLY_FILE, "utf8"));
  const targets = applyData.filter((r) => missingIds.has(r.game_id));
  console.log(`Targets: ${targets.length}`);

  const results = [];
  for (const t of targets) {
    const url = `https://psxdatacenter.com/psx2/images2/covers/${t.serial}.jpg`;
    const destPath = new URL(`${t.game_id}.jpg`, COVERS_DIR);
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000) throw new Error(`Suspiciously small (${buf.length} bytes)`);
      writeFileSync(destPath, buf);
      results.push({ game_id: t.game_id, serial: t.serial, bytes: buf.length, ok: true });
      console.log(`  OK ${t.game_id} (${buf.length} bytes)`);
    } catch (e) {
      results.push({ game_id: t.game_id, serial: t.serial, ok: false, error: e.message });
      console.log(`  FAIL ${t.game_id}: ${e.message}`);
    }
    await sleep(DELAY_MS);
  }

  writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
  const okCount = results.filter((r) => r.ok).length;
  console.log(`Done. ${okCount}/${targets.length} downloaded successfully.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
