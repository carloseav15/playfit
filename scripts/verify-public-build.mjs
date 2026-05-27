import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

const PRIVATE_FILES = new Set([
  "user_profile.csv",
  "user_game_opinions.csv",
  "recommendation_log.csv",
  "session_checkins.csv",
  "user_franchise_progress.csv",
  "user_platform_access.csv",
]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(absolute)));
    } else {
      files.push(absolute);
    }
  }

  return files;
}

const leakedFiles = (await walk(distDir)).filter((file) =>
  PRIVATE_FILES.has(path.basename(file)),
);

if (leakedFiles.length > 0) {
  console.error("Public build contains private data files:");
  leakedFiles.forEach((file) => console.error(`- ${path.relative(distDir, file)}`));
  process.exit(1);
}

const publicDataDir = path.join(distDir, "data", "public");
const publicCsvFiles = (await walk(publicDataDir)).filter((file) => file.endsWith(".csv"));

for (const file of publicCsvFiles) {
  const text = (await readFile(file, "utf8")).replace(/\r\n?/g, "\n");
  const parsed = Papa.parse(text, {
    header: true,
    newline: "\n",
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
    transform: (value) => value.trim(),
  });

  if (parsed.errors.length > 0) {
    console.error(`${path.relative(distDir, file)} parse failed: ${parsed.errors[0].message}`);
    process.exit(1);
  }
}

console.log("Public build data check passed.");
