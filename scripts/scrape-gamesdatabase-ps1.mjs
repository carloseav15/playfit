import { load } from "cheerio";
import { readFileSync, writeFileSync } from "node:fs";

const URLS_FILE = "/tmp/gdb-ps1-urls.txt";
const DELAY_MS = 350;
const OUT_FILE = new URL("../reports/gamesdatabase-ps1.json", import.meta.url);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(t) {
  return t.replace(/\s+/g, " ").trim();
}

function parseDetailPage(html, slug) {
  const $ = load(html);
  const infoTable = $("table").toArray().find((t) => {
    const text = $(t).text();
    return text.includes("Publisher:") && text.includes("Year:");
  });
  if (!infoTable) return null;

  const fields = {};
  $(infoTable)
    .find("tr")
    .each((_, tr) => {
      const cells = $(tr).find("td, th");
      if (cells.length < 2) return;
      const label = cleanText($(cells[0]).text());
      const value = cleanText($(cells[1]).text());
      if (/^(Publisher|Developer|Year|Category):?$/.test(label)) {
        fields[label.replace(":", "")] = value.replace(/\s*Info\s*$/, "").trim();
      }
    });

  const titleMatch = $("title").text().match(/^\s*(.+?)\s*-\s*Sony Playstation\s*-\s*Games Database/);
  const title = titleMatch ? titleMatch[1].trim() : slug;

  return {
    slug,
    title,
    publisher: fields.Publisher || null,
    developer: fields.Developer || null,
    year: fields.Year ? Number(fields.Year.match(/\d{4}/)?.[0]) : null,
    category: fields.Category || null,
  };
}

async function main() {
  const urls = readFileSync(URLS_FILE, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
  console.log(`Games to scrape: ${urls.length}`);

  const results = [];
  let processed = 0;
  for (const url of urls) {
    processed += 1;
    const slug = url.split("/").pop();
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      const html = await res.text();
      const parsed = parseDetailPage(html, slug);
      if (parsed) results.push(parsed);
      else results.push({ slug, error: "no info table found" });
    } catch (e) {
      results.push({ slug, error: e.message });
    }
    await sleep(DELAY_MS);
    if (processed % 100 === 0) {
      console.log(`  ${processed}/${urls.length} processed`);
      writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
    }
  }

  writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
  console.log(`Done. Wrote ${results.length} rows to ${OUT_FILE.pathname}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
