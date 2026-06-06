import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";
import fs from "fs/promises";
import path from "path";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  throw new Error("SUPABASE_SERVICE_KEY is required to run backfill-covers.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: "games_library" },
});

const BATCH_SIZE = 50;
const API_DELAY = 1500;
const DOWNLOAD_CONCURRENCY = 5;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Grouvee import ──

function slugifyTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

function normalizeTitleGrouvee(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseGrouveeHtml(html) {
  const $ = cheerio.load(html);
  const games = [];

  $('a[href^="/games/"]').each((_, el) => {
    const $a = $(el);
    const title = $a.attr("title")?.trim();
    const href = $a.attr("href")?.trim();
    if (!title || !href) return;

    const parts = href.split("/");
    const gameId = parts[2];

    const coverUrl =
      $a.parent().find("img[src*='cloudfront']").first().attr("src")?.trim() ||
      $a.closest("div[style*='12.5']").find("img[src*='cloudfront']").first().attr("src")?.trim() ||
      "";

    games.push({ gameId, title, coverUrl, href });
  });

  return games;
}

function extFromUrl(url) {
  const match = url.match(/\.(png|jpe?g|gif|webp|avif)(\?|$)/i);
  if (match) return match[1].startsWith("jpeg") ? "jpg" : match[1].toLowerCase();
  return null;
}

async function downloadImage(url, destPath) {
  if (!url) return false;
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const contentType = res.headers.get("content-type") || "";
    let ext = extFromUrl(url);
    if (!ext) {
      if (contentType.includes("png")) ext = "png";
      else if (contentType.includes("gif")) ext = "gif";
      else if (contentType.includes("webp")) ext = "webp";
      else ext = "jpg";
    }
    const finalPath = destPath.replace(/\.\w+$/, "") + "." + ext;
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(finalPath, buffer);
    return true;
  } catch {
    return false;
  }
}

async function loadExistingByTitle() {
  const map = new Map();
  let from = 0;
  const pageSize = 1000;
  let done = false;

  while (!done) {
    const { data, error } = await supabase
      .from("games")
      .select("game_id, title")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data ?? [];
    for (const g of batch) {
      const key = normalizeTitleGrouvee(g.title);
      if (!map.has(key)) map.set(key, g.game_id);
    }
    from += pageSize;
    if (batch.length < pageSize) done = true;
  }
  return map;
}

async function importFromGrouvee(htmlPath, downloadDir) {
  console.error(`Reading HTML from ${htmlPath}...`);
  const html = await fs.readFile(htmlPath, "utf-8");

  console.error("Parsing games...");
  const games = parseGrouveeHtml(html);
  console.error(`  Found ${games.length} games`);

  console.error("Loading existing games from DB...");
  const existingMap = await loadExistingByTitle();
  console.error(`  ${existingMap.size} existing games in DB`);

  const toUpdate = [];
  const toInsert = [];
  const downloadTasks = [];

  for (const game of games) {
    const slug = slugifyTitle(game.title);
    const extHint = extFromUrl(game.coverUrl) || "jpg";
    const fileName = `${slug}.${extHint}`;
    const localPath = `covers/games/${fileName}`;
    const fullPath = path.join(downloadDir, fileName);

    const normTitle = normalizeTitleGrouvee(game.title);
    const existingId = existingMap.get(normTitle);

    if (existingId) {
      toUpdate.push({ game_id: existingId, cover_url: localPath });
    } else {
      const newId = `grouvee_${slug}`;
      toInsert.push({
        game_id: newId,
        title: game.title,
        aliases: [],
        series: "",
        primary_genre: "",
        platforms: [],
        platform_names: [],
        release_year: "",
        release_state: "released",
        source_type: "catalog",
        source_ref: `grouvee:${game.gameId}`,
        cover_url: localPath,
        tags: [],
        notes: "",
        sort_date: "",
        release_label: "",
      });
      existingMap.set(normTitle, newId);
    }

    downloadTasks.push({ url: game.coverUrl, dest: fullPath });
  }

  // Download covers
  console.error(
    `Downloading ${downloadTasks.length} covers (concurrency: ${DOWNLOAD_CONCURRENCY})...`,
  );
  let downloaded = 0;
  let failed = 0;
  const queue = [...downloadTasks];

  async function worker() {
    while (queue.length > 0) {
      const task = queue.shift();
      const ok = await downloadImage(task.url, task.dest);
      if (ok) downloaded++;
      else failed++;
    }
  }

  const workers = Array.from({ length: DOWNLOAD_CONCURRENCY }, () => worker());
  await Promise.all(workers);
  console.error(`  Downloaded: ${downloaded}, Failed: ${failed}`);

  // Update existing games
  if (toUpdate.length > 0) {
    console.error(`Updating ${toUpdate.length} existing games...`);
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const batch = toUpdate.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map((u) =>
          supabase.from("games").update({ cover_url: u.cover_url }).eq("game_id", u.game_id),
        ),
      );
      const errs = results.filter((r) => r.error);
      if (errs.length > 0) console.error("  Errors:", errs[0].error.message);
      console.error(
        `  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toUpdate.length / BATCH_SIZE)} OK`,
      );
    }
  }

  // Insert new games
  if (toInsert.length > 0) {
    console.error(`Inserting ${toInsert.length} new games...`);
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("games").upsert(batch, { onConflict: "game_id" });
      if (error) {
        console.error(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ERROR ${error.message}`);
      } else {
        console.error(
          `  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toInsert.length / BATCH_SIZE)} OK`,
        );
      }
    }
  }

  console.error("\n=== Done ===");
  console.error(`  Total games: ${games.length}`);
  console.error(`  Updated: ${toUpdate.length}, New: ${toInsert.length}`);
  console.error(`  Covers downloaded: ${downloaded}, Failed: ${failed}`);
}

async function loadGamesWithoutCovers() {
  const games = [];
  let from = 0;
  const pageSize = 1000;
  let done = false;
  while (!done) {
    const { data, error } = await supabase
      .from("games")
      .select("game_id, title")
      .eq("cover_url", "")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data ?? [];
    for (const g of batch) games.push(g);
    from += pageSize;
    if (batch.length < pageSize) done = true;
  }
  return games;
}

async function fetchWikipediaImages(titles) {
  if (titles.length === 0) return {};
  const url =
    "https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&titles=" +
    encodeURIComponent(titles.join("|")) +
    "&pithumbsize=300&pilimit=" +
    titles.length +
    "&format=json&pilicense=any&redirects=1";
  const res = await fetch(url);
  if (!res.ok) return {};
  const data = await res.json();
  if (!data.query) return {};

  const results = {};

  // Build redirect map: from → to
  const redirectMap = {};
  if (data.query.redirects) {
    for (const r of data.query.redirects) {
      redirectMap[r.from] = r.to;
    }
  }

  for (const page of Object.values(data.query.pages)) {
    if (page.pageid === -1 || !page.thumbnail) continue;
    results[page.title] = page.thumbnail.source;
  }

  // Map redirect sources to their target image
  for (const [from, to] of Object.entries(redirectMap)) {
    if (results[to]) results[from] = results[to];
  }

  return results;
}

function needsVideoGameSuffix(title) {
  // Titles with years like "God of War (2018)"
  if (/ \(\d{4}\)$/.test(title)) return true;
  // Very short/generic titles that might be ambiguous
  if (title.length < 10 && !title.includes(":")) return true;
  return false;
}

async function main() {
  const args = process.argv.slice(2);
  const grouveeIdx = args.indexOf("--grouvee");

  if (grouveeIdx !== -1) {
    const htmlPath = args[grouveeIdx + 1];
    if (!htmlPath) {
      console.error("Usage: node backfill-covers.mjs --grouvee <path-to-html>");
      process.exit(1);
    }
    const downloadDir = path.join(process.cwd(), "apps", "web", "public", "covers", "games");
    await fs.mkdir(downloadDir, { recursive: true });
    await importFromGrouvee(htmlPath, downloadDir);
    return;
  }

  console.error("Loading games without covers...");
  const games = await loadGamesWithoutCovers();
  console.error("  " + games.length + " games need covers");

  let exactHits = 0;
  let fallbackHits = 0;
  let updated = 0;

  // ── Pass 1: exact titles ──
  console.error("\n=== Pass 1: exact titles ===");
  for (let i = 0; i < games.length; i += BATCH_SIZE) {
    const batch = games.slice(i, i + BATCH_SIZE);
    await sleep(API_DELAY);
    const images = await fetchWikipediaImages(batch.map((g) => g.title));

    const updates = [];
    for (const game of batch) {
      if (images[game.title]) {
        updates.push({ game_id: game.game_id, cover_url: images[game.title] });
        game._gotCover = true;
        exactHits++;
      }
    }

    if (updates.length > 0) {
      const results = await Promise.all(
        updates.map((u) =>
          supabase.from("games").update({ cover_url: u.cover_url }).eq("game_id", u.game_id),
        ),
      );
      const errs = results.filter((r) => r.error);
      if (errs.length > 0) console.error("  Errors:", errs[0].error.message);
      updated += updates.length;
    }

    const pct = (((i + batch.length) / games.length) * 100).toFixed(1);
    console.error(
      "  [" +
        pct +
        "%] batch " +
        (Math.floor(i / BATCH_SIZE) + 1) +
        "/" +
        Math.ceil(games.length / BATCH_SIZE) +
        ": " +
        updates.length +
        " covers (total " +
        exactHits +
        ")",
    );
  }

  // ── Pass 2: fallback for misses ──
  const misses = games.filter((g) => !g._gotCover && needsVideoGameSuffix(g.title));
  if (misses.length > 0) {
    console.error("\n=== Pass 2: fallback (video game) suffix ===");
    console.error("  " + misses.length + " ambiguous titles");

    for (let i = 0; i < misses.length; i += BATCH_SIZE) {
      const batch = misses.slice(i, i + BATCH_SIZE);
      await sleep(API_DELAY);
      const fallbackTitles = batch.map((g) => g.title + " (video game)");
      const images = await fetchWikipediaImages(fallbackTitles);

      const updates = [];
      for (const game of batch) {
        const fKey = game.title + " (video game)";
        if (images[fKey]) {
          updates.push({ game_id: game.game_id, cover_url: images[fKey] });
          fallbackHits++;
        }
      }

      if (updates.length > 0) {
        const results = await Promise.all(
          updates.map((u) =>
            supabase.from("games").update({ cover_url: u.cover_url }).eq("game_id", u.game_id),
          ),
        );
        const errs = results.filter((r) => r.error);
        if (errs.length > 0) console.error("  Errors:", errs[0].error.message);
        updated += updates.length;
      }

      const pct = (((i + batch.length) / misses.length) * 100).toFixed(1);
      console.error(
        "  [" +
          pct +
          "%] batch " +
          (Math.floor(i / BATCH_SIZE) + 1) +
          "/" +
          Math.ceil(misses.length / BATCH_SIZE) +
          ": " +
          updates.length +
          " covers (fallback total " +
          fallbackHits +
          ")",
      );
    }
  }

  const totalHits = exactHits + fallbackHits;
  console.error("\n=== Done ===");
  console.error("  Exact matches: " + exactHits);
  console.error("  Fallback matches: " + fallbackHits);
  console.error(
    "  Total: " +
      totalHits +
      "/" +
      games.length +
      " (" +
      ((totalHits / games.length) * 100).toFixed(1) +
      "%)",
  );
  console.error("  DB updates: " + updated);
}

main().catch(console.error);
