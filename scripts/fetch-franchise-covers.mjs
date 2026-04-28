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
const manifestPath = path.join(personalDataDir, "franchise_cover_assets.csv");
const publicDir = path.join(rootDir, "public", "covers");

const args = process.argv.slice(2);
const collectionFlagIndex = args.indexOf("--collection");
const collectionId =
  collectionFlagIndex >= 0 ? args[collectionFlagIndex + 1] : undefined;

const sourceHandlers = {
  async wikipedia_summary(sourceRef) {
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(sourceRef)}`;
    const response = await fetchWithRetry(summaryUrl);

    if (!response.ok) {
      throw new Error(`Wikipedia summary request failed (${response.status})`);
    }

    const payload = await response.json();
    const imageUrl =
      payload.thumbnail?.source ?? payload.originalimage?.source ?? "";

    if (!imageUrl) {
      throw new Error("No thumbnail or original image found");
    }

    return imageUrl;
  },
  async direct_url(sourceRef) {
    return sourceRef;
  },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, attempt = 0) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "games-library-workbench/0.1 cover-fetcher",
    },
  });

  if (response.status === 429 && attempt < 4) {
    await sleep(1000 * (attempt + 1));
    return fetchWithRetry(url, attempt + 1);
  }

  return response;
}

function extensionFromUrl(url, contentType = "") {
  const pathname = new URL(url).pathname.toLowerCase();
  const ext = path.extname(pathname);

  if (ext) {
    return ext;
  }

  if (contentType.includes("png")) {
    return ".png";
  }

  if (contentType.includes("webp")) {
    return ".webp";
  }

  return ".jpg";
}

function relativeCoverDir(collection) {
  return `/covers/${collection.replace(/_master$/, "").replace(/_/g, "-")}`;
}

const manifestText = (await readFile(manifestPath, "utf8"))
  .replace(/\r\n/g, "\n")
  .replace(/\r/g, "\n");
const parsed = Papa.parse(manifestText, { header: true, skipEmptyLines: true });
const rows = parsed.data;

if (parsed.errors.length > 0) {
  throw new Error(`Manifest parse failed: ${parsed.errors[0].message}`);
}

for (const row of rows) {
  if (collectionId && row.collection_id !== collectionId) {
    continue;
  }

  if (
    row.download_status === "downloaded" &&
    row.cover_path &&
    existsSync(path.join(rootDir, "public", row.cover_path.replace(/^\//, "")))
  ) {
    continue;
  }

  const handler = sourceHandlers[row.source_type];

  if (!handler) {
    row.download_status = "unsupported_source";
    continue;
  }

  try {
    const imageUrl = await handler(row.source_ref);
    const imageResponse = await fetchWithRetry(imageUrl);

    if (!imageResponse.ok) {
      throw new Error(`Image request failed (${imageResponse.status})`);
    }

    const contentType = imageResponse.headers.get("content-type") ?? "";
    const ext = extensionFromUrl(imageUrl, contentType);
    const coverDir = path.join(publicDir, row.collection_id.replace(/_master$/, "").replace(/_/g, "-"));
    const filename = `${row.entry_id}${ext}`;
    const absoluteFile = path.join(coverDir, filename);

    await mkdir(coverDir, { recursive: true });
    const arrayBuffer = await imageResponse.arrayBuffer();
    await writeFile(absoluteFile, Buffer.from(arrayBuffer));

    row.cover_path = `${relativeCoverDir(row.collection_id)}/${filename}`;
    row.resolved_image_url = imageUrl;
    row.download_status = "downloaded";
    await sleep(350);
  } catch (error) {
    row.download_status = "failed";
    row.resolved_image_url = "";
  }
}

await writeCsv(manifestPath, rows, [
  "asset_id",
  "entry_id",
  "collection_id",
  "series",
  "title",
  "source_type",
  "source_ref",
  "cover_path",
  "resolved_image_url",
  "download_status",
  "notes",
]);
