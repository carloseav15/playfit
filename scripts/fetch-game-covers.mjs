import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import { writeCsv } from "./lib/csv.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const personalDataDir = path.join(rootDir, "data", "personal");
const catalogPath = path.join(personalDataDir, "games_catalog.csv");
const manifestPath = path.join(personalDataDir, "game_cover_assets.csv");
const publicDir = path.join(rootDir, "public", "covers", "games");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, attempt = 0) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "games-library/1.0 game-cover-fetcher",
    },
  });

  if (response.status === 429 && attempt < 4) {
    await sleep(900 * (attempt + 1));
    return fetchWithRetry(url, attempt + 1);
  }

  return response;
}

function extensionFromUrl(url, contentType = "") {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const ext = path.extname(pathname);
    if (ext) {
      return ext;
    }
  } catch {
    // Fall through to content-type checks.
  }

  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  return ".jpg";
}

function normalizeText(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function baseTitleVariants(title) {
  const variants = new Set([title]);
  const stripped = title
    .replace(/\s*:\s*.*$/, "")
    .replace(/\s+-\s+.*$/, "")
    .replace(/\s+\(.*?\)\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (stripped && stripped !== title) {
    variants.add(stripped);
  }

  if (title.includes(" and ")) {
    variants.add(title.split(" and ")[0].trim());
  }

  if (title.includes(" I and II")) {
    variants.add(title.replace(" I and II", ""));
  }

  if (title.includes(" 1 and 2")) {
    variants.add(title.replace(" 1 and 2", ""));
  }

  return [...variants].filter(Boolean);
}

function scoreSearchCandidate(title, candidateTitle, snippet = "") {
  const target = normalizeText(title);
  const candidate = normalizeText(candidateTitle);
  const snippetNorm = normalizeText(snippet);
  let score = 0;

  if (candidate === target) score += 100;
  if (candidate.includes(target)) score += 40;
  if (target.includes(candidate)) score += 25;
  if (snippetNorm.includes("video game")) score += 15;
  if (snippetNorm.includes("game")) score += 8;

  const overlap = [...new Set(target.split(" "))].filter(
    (token) => token && candidate.split(" ").includes(token),
  ).length;
  score += overlap * 3;

  return score;
}

async function fetchWikipediaSummary(pageTitle) {
  const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`;
  const response = await fetchWithRetry(summaryUrl);

  if (!response.ok) {
    throw new Error(`Summary request failed (${response.status})`);
  }

  const payload = await response.json();
  const imageUrl = payload.thumbnail?.source ?? payload.originalimage?.source ?? "";

  if (!imageUrl) {
    throw new Error("No image found in summary");
  }

  return {
    pageTitle: payload.title || pageTitle,
    imageUrl,
  };
}

async function searchWikipedia(title) {
  const variants = baseTitleVariants(title);

  for (const variant of variants) {
    try {
      const direct = await fetchWikipediaSummary(variant);
      return direct;
    } catch {
      // Try search API next.
    }

    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&utf8=1&srlimit=6&srsearch=${encodeURIComponent(`"${variant}" video game`)}`;
    const response = await fetchWithRetry(searchUrl);

    if (!response.ok) {
      continue;
    }

    const payload = await response.json();
    const candidates = payload?.query?.search ?? [];

    const ranked = candidates
      .map((candidate) => ({
        title: candidate.title,
        snippet: candidate.snippet ?? "",
        score: scoreSearchCandidate(title, candidate.title, candidate.snippet),
      }))
      .sort((left, right) => right.score - left.score);

    for (const candidate of ranked) {
      try {
        const summary = await fetchWikipediaSummary(candidate.title);
        return summary;
      } catch {
        // Keep trying lower-ranked candidates.
      }
    }
  }

  throw new Error("No Wikipedia image source found");
}

function loadCsvRows(filePath) {
  return readFile(filePath, "utf8").then((text) => {
    const parsed = Papa.parse(text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), {
      header: true,
      skipEmptyLines: true,
    });

    if (parsed.errors.length > 0) {
      throw new Error(`${path.basename(filePath)} parse failed: ${parsed.errors[0].message}`);
    }

    return parsed.data;
  });
}

const GAME_COVER_COLUMNS = [
  "asset_id",
  "game_id",
  "title",
  "source_type",
  "source_ref",
  "cover_path",
  "resolved_image_url",
  "download_status",
  "notes",
];

function nextAssetId(existingRows) {
  const max = existingRows.reduce((highest, row) => {
    const match = /^GCA(\d+)$/.exec(row.asset_id ?? "");
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);

  return (max + 1).toString().padStart(3, "0");
}

const catalogRows = await loadCsvRows(catalogPath);
const manifestRows = await loadCsvRows(manifestPath);
const manifestByGameId = new Map(manifestRows.map((row) => [row.game_id, row]));

let nextId = Number(nextAssetId(manifestRows));

for (const game of catalogRows) {
  if (!manifestByGameId.has(game.game_id)) {
    const row = {
      asset_id: `GCA${String(nextId).padStart(3, "0")}`,
      game_id: game.game_id,
      title: game.title,
      source_type: "",
      source_ref: "",
      cover_path: "",
      resolved_image_url: "",
      download_status: "",
      notes: "Auto-generated game cover row.",
    };
    nextId += 1;
    manifestRows.push(row);
    manifestByGameId.set(game.game_id, row);
  }
}

await mkdir(publicDir, { recursive: true });

const fs = await import("node:fs/promises");
const localFiles = await fs.readdir(publicDir).catch(() => []);
for (const filename of localFiles) {
  const absolute = path.join(publicDir, filename);
  const stat = await fs.stat(absolute).catch(() => null);
  if (!stat?.isFile()) {
    continue;
  }

  const gameId = filename.replace(/\.[^.]+$/, "");
  const row = manifestByGameId.get(gameId);
  if (!row) {
    continue;
  }

  if (!row.cover_path || row.download_status !== "downloaded") {
    row.cover_path = `/covers/games/${filename}`;
    row.download_status = "downloaded";
    row.source_type = row.source_type || "wikipedia_search";
    row.notes = row.notes || "Recovered from existing local file.";
  }
}

await writeCsv(manifestPath, manifestRows, GAME_COVER_COLUMNS);

let processedSinceCheckpoint = 0;

for (const game of catalogRows) {
  const row = manifestByGameId.get(game.game_id);
  const existingPath = row.cover_path
    ? path.join(rootDir, "public", row.cover_path.replace(/^\//, ""))
    : "";

  if (
    row.download_status === "downloaded" &&
    row.cover_path &&
    existsSync(existingPath)
  ) {
    continue;
  }

  try {
    const { pageTitle, imageUrl } = await searchWikipedia(game.title);
    const imageResponse = await fetchWithRetry(imageUrl);

    if (!imageResponse.ok) {
      throw new Error(`Image request failed (${imageResponse.status})`);
    }

    const contentType = imageResponse.headers.get("content-type") ?? "";
    const ext = extensionFromUrl(imageUrl, contentType);
    const absoluteFile = path.join(publicDir, `${game.game_id}${ext}`);
    const buffer = Buffer.from(await imageResponse.arrayBuffer());

    await writeFile(absoluteFile, buffer);

    row.source_type = "wikipedia_search";
    row.source_ref = pageTitle;
    row.cover_path = `/covers/games/${game.game_id}${ext}`;
    row.resolved_image_url = imageUrl;
    row.download_status = "downloaded";
    row.notes = `Auto-fetched from Wikipedia page "${pageTitle}".`;
    await sleep(250);
  } catch {
    row.source_type = row.source_type || "wikipedia_search";
    row.download_status = "failed";
    row.cover_path = row.cover_path || "";
    row.resolved_image_url = "";
    row.notes = row.notes || "Automatic fetch failed.";
  }

  processedSinceCheckpoint += 1;
  if (processedSinceCheckpoint >= 10) {
    await writeCsv(manifestPath, manifestRows, GAME_COVER_COLUMNS);
    processedSinceCheckpoint = 0;
  }
}
await writeCsv(manifestPath, manifestRows, GAME_COVER_COLUMNS);
