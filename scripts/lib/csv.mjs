import path from "node:path";
import { writeFile } from "node:fs/promises";
import Papa from "papaparse";

function escapeCsvCell(value) {
  const normalized = value == null ? "" : String(value);

  if (!/[",\n\r]/.test(normalized)) {
    return normalized;
  }

  return `"${normalized.replaceAll('"', '""')}"`;
}

export function serializeCsv(rows, columns) {
  const header = columns.map(escapeCsvCell).join(",");
  const body = rows
    .map((row) => columns.map((column) => escapeCsvCell(row[column])).join(","))
    .join("\n");

  return `${header}\n${body}\n`;
}

export function validateCsv(text, columns, filePath = "csv") {
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
    transform: (value) => value.trim(),
  });

  if (parsed.errors.length > 0) {
    throw new Error(`${path.basename(filePath)} parse failed: ${parsed.errors[0].message}`);
  }

  const parsedColumns = parsed.meta.fields ?? [];
  const missingColumns = columns.filter((column) => !parsedColumns.includes(column));

  if (missingColumns.length > 0) {
    throw new Error(
      `${path.basename(filePath)} missing expected columns: ${missingColumns.join(", ")}`,
    );
  }
}

export async function writeCsv(filePath, rows, columns) {
  const csv = serializeCsv(rows, columns);
  validateCsv(csv, columns, filePath);
  await writeFile(filePath, csv, "utf8");
}
