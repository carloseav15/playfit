import fs from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";

const ROOT = path.resolve(process.cwd());
const DATA_DIR = path.join(ROOT, "data", "personal");

function parseCsv(text) {
  const normalized = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const parsed = Papa.parse(normalized, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
    transform: (value) => value.trim(),
  });
  if (parsed.errors?.length) {
    const first = parsed.errors[0];
    throw new Error(`CSV parse error: ${first.message} at row ${first.row}`);
  }
  return parsed.data;
}

function levelScore(value) {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  if (value === "low") return 1;
  return 0;
}

function paceScore(value) {
  if (value === "fast") return 3;
  if (value === "medium") return 2;
  if (value === "slow") return 1;
  return 0;
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreProfileMatch(record) {
  let score = 0;
  score += levelScore(record.story_strength) * 8;
  score += levelScore(record.progression_clarity) * 8;
  score += levelScore(record.early_hook) * 6;
  score += levelScore(record.aesthetic_fit) * 7;
  score += levelScore(record.emotional_complexity) * 6;
  score += levelScore(record.combat_depth) * 4;
  score += paceScore(record.pacing_speed) * 6;
  score -= levelScore(record.endgame_repetition_risk) * 5;
  return clampScore(score);
}

function scoreNextToPlay(opinion, catalog) {
  // Focus on "what to play next": profile match first, then bias towards resume.
  let score = scoreProfileMatch(catalog);

  if (opinion.status === "playing") score += 20;
  if (opinion.status === "on_hold") score += 12;
  if (opinion.status === "backlog") score += 6;
  if (opinion.status === "interested_not_started") score += 0;
  return clampScore(score);
}

const ACTIONABLE = new Set(["playing", "on_hold", "backlog", "interested_not_started"]);

const [gamesCatalogText, opinionsText, platformMapText, platformAccessText] = await Promise.all([
  fs.readFile(path.join(DATA_DIR, "games_catalog.csv"), "utf8"),
  fs.readFile(path.join(DATA_DIR, "user_game_opinions.csv"), "utf8"),
  fs.readFile(path.join(DATA_DIR, "game_platforms.csv"), "utf8"),
  fs.readFile(path.join(DATA_DIR, "user_platform_access.csv"), "utf8"),
]);

const catalogRows = parseCsv(gamesCatalogText);
const opinionRows = parseCsv(opinionsText);
const platformRows = parseCsv(platformMapText);
const accessRows = parseCsv(platformAccessText);

const accessiblePlatforms = new Set(
  accessRows.filter((row) => row.access_status === "available").map((row) => row.platform_id),
);

const platformByGame = new Map();
for (const row of platformRows) {
  if (!row.game_id || !row.platform_id) continue;
  const list = platformByGame.get(row.game_id) ?? [];
  list.push(row.platform_id);
  platformByGame.set(row.game_id, list);
}

const catalogById = new Map(catalogRows.map((row) => [row.game_id, row]));

const candidates = [];
for (const opinion of opinionRows) {
  if (!ACTIONABLE.has(opinion.status)) continue;
  const catalog = catalogById.get(opinion.game_id);
  if (!catalog) continue;

  const platforms = platformByGame.get(opinion.game_id) ?? [];
  const hasAccessiblePlatform = platforms.some((platformId) => accessiblePlatforms.has(platformId));
  if (!hasAccessiblePlatform) continue;

  candidates.push({
    game_id: opinion.game_id,
    title: opinion.title || catalog.title,
    status: opinion.status,
    series: catalog.series,
    primary_genre: catalog.primary_genre,
    score: scoreNextToPlay(opinion, catalog),
  });
}

candidates.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

const top = candidates.slice(0, 10);
process.stdout.write(JSON.stringify({ generated_on: new Date().toISOString(), top }, null, 2));
