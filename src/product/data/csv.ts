import Papa from "papaparse";

type ParsedRow = Record<string, string>;

const DEFAULT_PRODUCT_DATA_BASE = `${import.meta.env.BASE_URL}data/public/`;

function getDataBaseUrl() {
  const configured = import.meta.env.VITE_PRODUCT_DATA_BASE as string | undefined;
  const base = configured?.trim() || DEFAULT_PRODUCT_DATA_BASE;
  return base.endsWith("/") ? base : `${base}/`;
}

function getDatasetUrl(file: string) {
  return `${getDataBaseUrl()}${file}`;
}

export async function loadCsvText(file: string) {
  const response = await fetch(getDatasetUrl(file), { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Could not load ${file}`);
  }

  return response.text();
}

export function parseCsv<T>(text: string, file: string, requiredHeaders: string[]) {
  const result = Papa.parse<ParsedRow>(text, {
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

  return result.data.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key.trim(), value?.trim?.() ?? ""]),
    ) as T,
  );
}
