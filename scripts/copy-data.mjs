import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

const PERSONAL_FILES = [
  "user_profile.csv",
  "games_catalog.csv",
  "game_universe.csv",
  "master_game_universe.csv",
  "upcoming_releases.csv",
  "platforms.csv",
  "user_platform_access.csv",
  "game_platforms.csv",
  "upcoming_release_platforms.csv",
  "user_game_opinions.csv",
  "recommendation_log.csv",
  "session_checkins.csv",
  "franchise_master_entries.csv",
  "user_franchise_progress.csv",
  "franchise_cover_assets.csv",
  "game_cover_assets.csv",
];

const PUBLIC_FILES = [
  "games_catalog.csv",
  "game_universe.csv",
  "game_cover_assets.csv",
  "platforms.csv",
  "game_platforms.csv",
  "master_game_universe.csv",
  "upcoming_releases.csv",
  "upcoming_release_platforms.csv",
];

const target = process.argv[2];
const config = {
  personal: {
    sourceDir: path.join(rootDir, "data", "personal"),
    outputDir: path.join(distDir, "data", "personal"),
    files: PERSONAL_FILES,
  },
  public: {
    sourceDir: path.join(rootDir, "data", "public"),
    outputDir: path.join(distDir, "data", "public"),
    files: PUBLIC_FILES,
  },
}[target ?? ""];

if (!config) {
  console.error("Usage: node scripts/copy-data.mjs <personal|public>");
  process.exit(1);
}

await mkdir(config.outputDir, { recursive: true });

const existingFiles = new Set(await readdir(config.sourceDir));
const missing = config.files.filter((file) => !existingFiles.has(file));

if (missing.length > 0) {
  throw new Error(
    `${target} data is missing required files: ${missing.join(", ")}`,
  );
}

await Promise.all(
  config.files.map((file) =>
    copyFile(path.join(config.sourceDir, file), path.join(config.outputDir, file)),
  ),
);

const oppositeDir =
  target === "public"
    ? path.join(distDir, "data", "personal")
    : path.join(distDir, "data", "public");

await rm(oppositeDir, { force: true, recursive: true });

console.log(`Copied ${config.files.length} ${target} data files.`);
