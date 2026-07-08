import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const bucketName = process.env.COVER_STORAGE_BUCKET ?? "game-covers";
const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const serviceKey =
  process.env.SUPABASE_SERVICE_KEY ?? process.env.SERVICE_ROLE_KEY ?? process.env.SECRET_KEY;
const coverDir = path.join(process.cwd(), "apps", "web", "public", "covers", "games");
const allowedImageExtension = /\.(jpe?g|png)$/i;
const pageSize = 1000;

function normalizeLocalCoverUrl(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed)) return null;
  const noLeadingSlash = trimmed.replace(/^\/+/, "");
  return noLeadingSlash.startsWith("covers/games/") ? noLeadingSlash : null;
}

function contentTypeFor(filename) {
  if (/\.png$/i.test(filename)) return "image/png";
  return "image/jpeg";
}

function publicUrlFor(filename) {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${bucketName}/${encodeURIComponent(filename)}`;
}

async function loadGames(supabase) {
  const games = [];
  let from = 0;
  let done = false;

  while (!done) {
    const { data, error } = await supabase
      .schema("games_library")
      .from("games")
      .select("game_id,title,cover_url")
      .order("game_id")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Failed to load games: ${error.message}`);

    const batch = data ?? [];
    games.push(...batch);
    from += pageSize;
    done = batch.length < pageSize;
  }

  return games;
}

async function ensureBucket(supabase) {
  const { data: bucket, error: getError } = await supabase.storage.getBucket(bucketName);
  if (!getError && bucket) return { created: false };
  if (getError && getError.message !== "Bucket not found") {
    throw new Error(`Failed to inspect bucket ${bucketName}: ${getError.message}`);
  }

  const { error: createError } = await supabase.storage.createBucket(bucketName, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png"],
  });
  if (createError) throw new Error(`Failed to create bucket ${bucketName}: ${createError.message}`);
  return { created: true };
}

async function uploadFiles(supabase, files) {
  let uploaded = 0;
  for (const file of files) {
    const absolutePath = path.join(coverDir, file.filename);
    const { error } = await supabase.storage
      .from(bucketName)
      .upload(file.filename, readFileSync(absolutePath), {
        cacheControl: "31536000",
        contentType: contentTypeFor(file.filename),
        upsert: true,
      });

    if (error) {
      throw new Error(`Failed to upload ${file.filename}: ${error.message}`);
    }
    uploaded += 1;
  }
  return uploaded;
}

async function updateDatabase(supabase, rows) {
  let updated = 0;
  for (const row of rows) {
    const { error } = await supabase
      .schema("games_library")
      .from("games")
      .update({ cover_url: row.nextCoverUrl })
      .eq("game_id", row.game_id)
      .eq("cover_url", row.cover_url);

    if (error) throw new Error(`Failed to update ${row.game_id}: ${error.message}`);
    updated += 1;
  }
  return updated;
}

async function main() {
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_KEY, SERVICE_ROLE_KEY, or SECRET_KEY is required.");
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const coverFiles = existsSync(coverDir)
    ? readdirSync(coverDir)
        .filter((filename) => allowedImageExtension.test(filename))
        .filter((filename) => statSync(path.join(coverDir, filename)).isFile())
        .sort()
    : [];
  const localFileRefs = new Set(coverFiles.map((filename) => `covers/games/${filename}`));

  const games = await loadGames(supabase);
  const localCoverRows = games
    .map((game) => ({ ...game, localRef: normalizeLocalCoverUrl(game.cover_url) }))
    .filter((game) => game.localRef);
  const missingFiles = localCoverRows.filter((game) => !localFileRefs.has(game.localRef));
  const referencedFiles = [...new Set(localCoverRows.map((game) => game.localRef))]
    .map((localRef) => ({
      localRef,
      filename: localRef.slice("covers/games/".length),
    }))
    .sort((a, b) => a.filename.localeCompare(b.filename));
  const unusedFiles = coverFiles.filter((filename) => {
    return !referencedFiles.some((file) => file.filename === filename);
  });
  const rowsToUpdate = localCoverRows.map((row) => ({
    ...row,
    filename: row.localRef.slice("covers/games/".length),
    nextCoverUrl: publicUrlFor(row.localRef.slice("covers/games/".length)),
  }));

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        supabaseUrl,
        bucketName,
        localImageFiles: coverFiles.length,
        dbRowsWithLocalCover: localCoverRows.length,
        distinctReferencedFiles: referencedFiles.length,
        missingFiles: missingFiles.length,
        unusedFiles: unusedFiles.length,
        rowsToUpdate: rowsToUpdate.length,
        sampleFiles: referencedFiles.slice(0, 10).map((file) => file.localRef),
      },
      null,
      2,
    ),
  );

  if (missingFiles.length > 0 || unusedFiles.length > 0) {
    throw new Error("Refusing to migrate: local cover files and DB references are not aligned.");
  }
  if (apply && rowsToUpdate.length > 0 && coverFiles.length === 0) {
    throw new Error(`Cover directory not found: ${coverDir}`);
  }

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to create the bucket, upload, and update DB.");
    return;
  }

  const bucket = await ensureBucket(supabase);
  const uploaded = await uploadFiles(supabase, referencedFiles);
  const updated = await updateDatabase(supabase, rowsToUpdate);

  console.log(
    JSON.stringify(
      {
        bucketCreated: bucket.created,
        uploaded,
        updatedRows: updated,
        publicUrlSample: rowsToUpdate.slice(0, 5).map((row) => row.nextCoverUrl),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
