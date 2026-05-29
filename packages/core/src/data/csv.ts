import Papa from "papaparse";

type ParsedRow = Record<string, string>;

export const PRODUCT_DATA_FILES = [
  "games_catalog.csv",
  "game_cover_assets.csv",
  "platforms.csv",
  "game_platforms.csv",
  "game_universe.csv",
  "master_game_universe.csv",
  "upcoming_releases.csv",
] as const;

export type ProductDataFile = (typeof PRODUCT_DATA_FILES)[number];

function getDataBaseUrl(baseUrl = "/data/public/") {
  const base = baseUrl.trim() || "/data/public/";
  return base.endsWith("/") ? base : `${base}/`;
}

function getDatasetUrl(file: string, baseUrl?: string) {
  return `${getDataBaseUrl(baseUrl)}${file}`;
}

export async function loadCsvText(file: ProductDataFile, baseUrl?: string) {
  const response = await fetch(getDatasetUrl(file, baseUrl), { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Could not load ${file}`);
  }

  return response.text();
}

export function parseCsv<T>(text: string, file: string, requiredHeaders: string[]) {
  const normalizedText = text.replace(/\r\n?/g, "\n");
  const result = Papa.parse<ParsedRow>(normalizedText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
    transform: (value) => value.trim(),
  });

  if (result.errors.length > 0) {
    throw new Error(`Could not parse ${file}: ${result.errors[0]?.message}`);
  }

  const headers = result.meta.fields ?? [];
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));

  if (missingHeaders.length > 0) {
    throw new Error(`${file} is missing expected columns: ${missingHeaders.join(", ")}`);
  }

  return result.data.map(
    (row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key.trim(), value?.trim?.() ?? ""]),
      ) as T,
  );
}
