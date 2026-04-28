import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeCsv } from "./lib/csv.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const personalDataDir = path.join(rootDir, "data", "personal");

const inputPath = process.argv[2] ?? path.join(personalDataDir, "raw-data-images.rtf");
const outputPath =
  process.argv[3] ?? path.join(personalDataDir, "raw-data-images-extracted.csv");

const htmlText = execFileSync(
  "textutil",
  ["-convert", "txt", "-stdout", inputPath],
  {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  },
);

const anchorPattern = /<a title="([^"]+)" href="(\/games\/[^"]+)">/g;
const coverPattern = /https:\/\/d2d2z3qzqjizpf\.cloudfront\.net[^"&<\s]+/;

function decodeHtmlEntities(value) {
  let decoded = value;

  while (true) {
    const next = decoded
      .replaceAll("&amp;", "&")
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'")
      .replaceAll("&apos;", "'")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">");

    if (next === decoded) {
      return next;
    }

    decoded = next;
  }
}

const anchors = [];
let anchorMatch;

while ((anchorMatch = anchorPattern.exec(htmlText)) !== null) {
  anchors.push({
    title: anchorMatch[1],
    ggPath: anchorMatch[2],
    index: anchorMatch.index,
  });
}

const rows = [];
const seen = new Set();

for (let index = 0; index < anchors.length; index += 1) {
  const current = anchors[index];
  const next = anchors[index + 1];
  const segment = htmlText.slice(current.index, next?.index ?? htmlText.length);
  const coverUrl = segment.match(coverPattern)?.[0] ?? "";

  if (!coverUrl) {
    continue;
  }

  const key = `${current.ggPath}::${coverUrl}`;
  if (seen.has(key)) {
    continue;
  }

  seen.add(key);
  rows.push({
    title: decodeHtmlEntities(current.title),
    gg_url: `https://ggapp.io${current.ggPath}`,
    cover_url: coverUrl,
  });
}

await writeCsv(outputPath, rows, ["title", "gg_url", "cover_url"]);

console.log(
  `Extracted ${rows.length} cover rows from ${path.basename(inputPath)} to ${path.basename(outputPath)}`,
);
