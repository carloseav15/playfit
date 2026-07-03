// Downloads PS1 box art covers from psxdatacenter.com for games that matched
// our catalog (reports/psxdatacenter-ps1-apply.json) but currently have no
// cover_url. Cover images live at images/covers/U/{letter-group}/{SERIAL}.jpg,
// where the letter-group mirrors the list page's games/U/{group}/ subfolder
// (captured per-game in reports/psxdatacenter-ps1-ntscu.json's infoPath).
// Not every game has a scanned cover; 404s are skipped.
import { readFileSync, writeFileSync } from "node:fs";

const APPLY_FILE = new URL("../reports/psxdatacenter-ps1-apply.json", import.meta.url);
const SCRAPE_FILE = new URL("../reports/psxdatacenter-ps1-ntscu.json", import.meta.url);
const MISSING_IDS_FILE = "/private/tmp/claude-501/-Users-carancibia-Projects-playfit/1d7a580e-06e2-486a-bb08-4bee589bdee0/scratchpad/ps1_missing_cover_game_ids.txt";
const COVERS_DIR = new URL("../apps/web/public/covers/games/", import.meta.url);
const OUT_FILE = new URL("../reports/psxdatacenter-ps1-covers-downloaded.json", import.meta.url);
const DELAY_MS = 300;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const missingIds = new Set(
    readFileSync(MISSING_IDS_FILE, "utf8").split("\n").map((s) => s.trim()).filter(Boolean),
  );
  const applyData = JSON.parse(readFileSync(APPLY_FILE, "utf8"));
  const scrapeData = JSON.parse(readFileSync(SCRAPE_FILE, "utf8"));
  const groupBySerial = new Map(
    scrapeData.map((s) => [s.serial, s.infoPath.split("/")[2]]),
  );

  const targets = applyData.filter((r) => missingIds.has(r.game_id));
  console.log(`Targets: ${targets.length}`);

  const results = [];
  let ok = 0;
  for (const t of targets) {
    const group = groupBySerial.get(t.serial);
    const url = `https://psxdatacenter.com/images/covers/U/${group}/${t.serial}.jpg`;
    const destPath = new URL(`${t.game_id}.jpg`, COVERS_DIR);
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000) throw new Error(`Suspiciously small (${buf.length} bytes)`);
      writeFileSync(destPath, buf);
      results.push({ game_id: t.game_id, serial: t.serial, bytes: buf.length, ok: true });
      ok += 1;
    } catch (e) {
      results.push({ game_id: t.game_id, serial: t.serial, ok: false, error: e.message });
    }
    await sleep(DELAY_MS);
  }

  writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
  console.log(`Done. ${ok}/${targets.length} downloaded successfully.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
