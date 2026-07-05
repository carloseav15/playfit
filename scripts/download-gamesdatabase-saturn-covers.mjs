import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { load } from "cheerio";

const APPLY_FILE = new URL("../reports/gamesdatabase-saturn-apply.json", import.meta.url);
const COVERS_DIR = new URL("../apps/web/public/covers/games/", import.meta.url);
const OUT_FILE = new URL("../reports/gamesdatabase-saturn-covers-downloaded.json", import.meta.url);
const DELAY_MS = 350;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugifyPublisher(name) {
  if (!name) return null;
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function fetchMediaPage(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) return null;
  return await res.text();
}

function extractBigImagePath(html) {
  const $ = load(html);
  const imgs = $("img");
  for (const img of imgs) {
    const src = $(img).attr("src") || "";
    const match = src.match(/\/Media\/SYSTEM\/Sega_Saturn\/Box\/big\/(.+)\.jpg/i);
    if (match) return match[0];
  }
  return null;
}

function toThumbnailUrl(bigPath) {
  const parts = bigPath.split("/");
  const filename = parts[parts.length - 1];
  parts[parts.length - 2] = "Thumb";
  parts[parts.length - 1] = "Thumb_" + filename;
  return "https://www.gamesdatabase.org" + parts.join("/");
}

function isValidJpeg(buf) {
  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

async function main() {
  const applyData = JSON.parse(readFileSync(APPLY_FILE, "utf8"));
  const targets = applyData.filter((r) => r.needs_cover);

  if (!existsSync(COVERS_DIR)) {
    mkdirSync(COVERS_DIR, { recursive: true });
  }

  let results = [];
  if (existsSync(OUT_FILE)) {
    results = JSON.parse(readFileSync(OUT_FILE, "utf8"));
    console.log(`Resuming: ${results.length} already processed`);
  }

  const doneIds = new Set(results.map((r) => r.game_id));
  const remaining = targets.filter((t) => !doneIds.has(t.game_id));
  console.log(`Targets: ${targets.length} total, ${remaining.length} remaining`);

  let ok = results.filter((r) => r.ok).length;
  let failed404 = results.filter((r) => !r.ok && r.error && r.error.includes("404")).length;
  let failedOther = results.filter((r) => !r.ok && (!r.error || !r.error.includes("404"))).length;

  for (const t of remaining) {
    const publisherSlug = slugifyPublisher(t.apply_publisher);
    const year = t.apply_year;

    const urlsToTry = [];
    if (publisherSlug && year) {
      urlsToTry.push(
        `https://www.gamesdatabase.org/media/sega-saturn/artwork-box/${year}/${publisherSlug}/${t.slug}`,
      );
    }
    if (year) {
      urlsToTry.push(
        `https://www.gamesdatabase.org/media/sega-saturn/artwork-box/${year}/${t.slug}`,
      );
    }

    let html = null;
    for (const url of urlsToTry) {
      html = await fetchMediaPage(url);
      if (html) break;
    }

    if (!html) {
      results.push({ game_id: t.game_id, slug: t.slug, ok: false, error: "no media page found (404)" });
      failed404 += 1;
      console.log(`  FAIL ${t.game_id}: no media page (404)`);
      writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
      await sleep(DELAY_MS);
      continue;
    }

    const bigPath = extractBigImagePath(html);
    if (!bigPath) {
      results.push({ game_id: t.game_id, slug: t.slug, ok: false, error: "no box art img in page" });
      failed404 += 1;
      console.log(`  FAIL ${t.game_id}: no box art img on page`);
      writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
      await sleep(DELAY_MS);
      continue;
    }

    const thumbUrl = toThumbnailUrl(bigPath);
    const destPath = new URL(`${t.game_id}.jpg`, COVERS_DIR);

    try {
      const res = await fetch(thumbUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000) throw new Error(`Suspiciously small (${buf.length} bytes)`);
      if (!isValidJpeg(buf)) throw new Error("Not a valid JPEG (magic bytes mismatch)");
      writeFileSync(destPath, buf);

      results.push({ game_id: t.game_id, slug: t.slug, bytes: buf.length, ok: true });
      ok += 1;
      console.log(`  OK ${t.game_id} (${buf.length} bytes) - ${ok}/${targets.length}`);
    } catch (e) {
      results.push({ game_id: t.game_id, slug: t.slug, ok: false, error: e.message });
      failedOther += 1;
      console.log(`  FAIL ${t.game_id}: ${e.message}`);
    }

    writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
    await sleep(DELAY_MS);
  }

  console.log(`\nDone. ${ok}/${targets.length} downloaded successfully.`);
  console.log(`  404/no-art: ${failed404}, Other errors: ${failedOther}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
