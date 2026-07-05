// Mirrors every enumerable IGDB API endpoint into the private local Postgres
// schema `igdb_raw`. This stores API metadata only; referenced image/video
// binaries are not downloaded.
//
// First run:
//   node scripts/sync-igdb-mirror.mjs --mode full
//
// Resume an interrupted full run:
//   node scripts/sync-igdb-mirror.mjs --mode full --resume
//
// Refresh records exposed by IGDB with an updated_at field:
//   node scripts/sync-igdb-mirror.mjs --mode incremental
//
// Test one or more endpoints:
//   node scripts/sync-igdb-mirror.mjs --mode full --endpoints genres,games
import { readFileSync } from "node:fs";
import process from "node:process";

import pg from "pg";

const { Client } = pg;

const PAGE_SIZE = 500;
const REQUEST_DELAY_MS = 270;
const PROGRESS_EVERY = 25_000;
const DEFAULT_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const VOLATILE_ENDPOINTS = new Set(["popularity_primitives"]);

// Generated from the Request Path entries in the official IGDB API docs on
// 2026-07-04. `search` is intentionally absent because it requires a search
// term and is not an enumerable entity collection.
const ENDPOINTS = [
  "age_rating_categories",
  "age_rating_content_description_types",
  "age_rating_content_descriptions",
  "age_rating_content_descriptions_v2",
  "age_rating_organizations",
  "age_ratings",
  "alternative_names",
  "artwork_types",
  "artworks",
  "character_genders",
  "character_mug_shots",
  "character_species",
  "characters",
  "collection_membership_types",
  "collection_memberships",
  "collection_relation_types",
  "collection_relations",
  "collection_types",
  "collections",
  "companies",
  "company_logos",
  "company_sizes",
  "company_statuses",
  "company_type_histories",
  "company_types",
  "company_websites",
  "covers",
  "date_formats",
  "entity_types",
  "event_logos",
  "event_networks",
  "events",
  "external_game_sources",
  "external_games",
  "franchises",
  "game_engine_logos",
  "game_engines",
  "game_localizations",
  "game_modes",
  "game_release_formats",
  "game_statuses",
  "game_time_to_beats",
  "game_types",
  "game_version_feature_values",
  "game_version_features",
  "game_versions",
  "game_videos",
  "games",
  "genres",
  "image_types",
  "involved_companies",
  "keywords",
  "language_support_types",
  "language_supports",
  "languages",
  "multiplayer_modes",
  "network_types",
  "platform_families",
  "platform_logos",
  "platform_types",
  "platform_version_companies",
  "platform_version_release_dates",
  "platform_versions",
  "platform_websites",
  "platforms",
  "player_perspectives",
  "popularity_primitives",
  "popularity_types",
  "regions",
  "release_date_regions",
  "release_date_statuses",
  "release_dates",
  "report_types",
  "reports",
  "screenshots",
  "themes",
  "website_types",
  "websites",
];

function loadDotEnv() {
  try {
    const contents = readFileSync(new URL("../.env", import.meta.url), "utf8");
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const separator = line.indexOf("=");
      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if (
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function parseArgs(argv) {
  const args = {
    mode: "full",
    resume: false,
    endpoints: null,
    continueOnError: true,
    refreshStatic: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--mode") args.mode = argv[++index];
    else if (arg === "--resume") args.resume = true;
    else if (arg === "--endpoints") {
      args.endpoints = argv[++index]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    } else if (arg === "--stop-on-error") args.continueOnError = false;
    else if (arg === "--refresh-static") args.refreshStatic = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/sync-igdb-mirror.mjs [options]

Options:
  --mode full|incremental  Sync mode (default: full)
  --resume                Resume the latest interrupted run of the same mode
  --endpoints a,b,c       Sync only the listed endpoints
  --refresh-static        In incremental mode, fully refresh endpoints without updated_at
  --stop-on-error         Stop instead of continuing when one endpoint fails`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!new Set(["full", "incremental"]).has(args.mode)) {
    throw new Error(`Invalid --mode: ${args.mode}`);
  }
  if (args.endpoints) {
    const unknown = args.endpoints.filter((endpoint) => !ENDPOINTS.includes(endpoint));
    if (unknown.length > 0) throw new Error(`Unknown endpoints: ${unknown.join(", ")}`);
  }
  return args;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// Schema DDL lives in
// supabase/migrations/20260704200000_create_igdb_raw_mirror_schema.sql so it
// survives `supabase db reset`. This just checks it was applied.
async function ensureSchema(db) {
  const result = await db.query(
    `select 1 from information_schema.schemata where schema_name = 'igdb_raw'`,
  );
  if (result.rowCount === 0) {
    throw new Error(
      "igdb_raw schema not found. Run `supabase migration up` (or `supabase db reset`) " +
        "to apply supabase/migrations/20260704200000_create_igdb_raw_mirror_schema.sql first.",
    );
  }
}

async function getOrCreateRun(db, args, endpoints) {
  if (args.resume) {
    const resumed = await db.query(
      `select id
         from igdb_raw.sync_runs
        where mode = $1
          and status in ('running', 'failed', 'completed_with_errors')
          and requested_endpoints = $2::text[]
        order by started_at desc
        limit 1`,
      [args.mode, endpoints],
    );
    if (resumed.rowCount > 0) {
      const runId = resumed.rows[0].id;
      await db.query(
        `update igdb_raw.sync_runs
            set status = 'running', finished_at = null
          where id = $1`,
        [runId],
      );
      return { runId, resumed: true };
    }
  }

  const created = await db.query(
    `insert into igdb_raw.sync_runs (mode, requested_endpoints)
     values ($1, $2::text[])
     returning id`,
    [args.mode, endpoints],
  );
  return { runId: created.rows[0].id, resumed: false };
}

let accessToken = null;
let lastIgdbRequestStartedAt = 0;

async function getToken() {
  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: process.env.IGDB_CLIENT_ID,
      client_secret: process.env.IGDB_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  if (!response.ok) throw new Error(`Twitch token ${response.status}: ${await response.text()}`);
  accessToken = (await response.json()).access_token;
}

async function igdbRequest(endpoint, body, attempt = 1) {
  if (!accessToken) await getToken();
  const timeSinceLastRequest = Date.now() - lastIgdbRequestStartedAt;
  if (timeSinceLastRequest < REQUEST_DELAY_MS) {
    await sleep(REQUEST_DELAY_MS - timeSinceLastRequest);
  }
  lastIgdbRequestStartedAt = Date.now();
  let response;
  try {
    response = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
      method: "POST",
      headers: {
        "Client-ID": process.env.IGDB_CLIENT_ID,
        Authorization: `Bearer ${accessToken}`,
      },
      body,
    });
  } catch (error) {
    if (attempt <= 6) {
      await sleep(Math.min(30_000, 1_000 * 2 ** (attempt - 1)));
      return igdbRequest(endpoint, body, attempt + 1);
    }
    throw new Error(`IGDB ${endpoint} network failure after retries: ${error.message}`);
  }
  const responseText = await response.text();

  if (response.status === 401 && attempt <= 2) {
    await getToken();
    return igdbRequest(endpoint, body, attempt + 1);
  }
  if ((response.status === 429 || response.status >= 500) && attempt <= 6) {
    await sleep(Math.min(30_000, 1_000 * 2 ** (attempt - 1)));
    return igdbRequest(endpoint, body, attempt + 1);
  }
  if (!response.ok) {
    throw new Error(`IGDB ${endpoint} ${response.status}: ${responseText.slice(0, 500)}`);
  }
  return JSON.parse(responseText);
}

async function fetchEndpointCount(endpoint) {
  const result = await igdbRequest(`${endpoint}/count`, "");
  return Number(result.count);
}

async function upsertPage(db, endpoint, rows, runId) {
  const ids = [];
  const payloads = [];
  const checksums = [];
  const sourceCreatedAt = [];
  const sourceUpdatedAt = [];

  for (const row of rows) {
    if (!Number.isSafeInteger(row.id)) {
      throw new Error(`${endpoint}: record without a safe integer id`);
    }
    ids.push(row.id);
    payloads.push(JSON.stringify(row));
    checksums.push(row.checksum ?? null);
    sourceCreatedAt.push(Number.isSafeInteger(row.created_at) ? row.created_at : null);
    sourceUpdatedAt.push(Number.isSafeInteger(row.updated_at) ? row.updated_at : null);
  }

  await db.query(
    `insert into igdb_raw.entities as target (
       endpoint, igdb_id, payload, checksum, source_created_at,
       source_updated_at, last_seen_run_id
     )
     select $1,
            source.igdb_id,
            source.payload::jsonb,
            source.checksum,
            source.source_created_at,
            source.source_updated_at,
            $7::uuid
       from unnest(
         $2::bigint[], $3::text[], $4::text[], $5::bigint[], $6::bigint[]
       ) as source(
         igdb_id, payload, checksum, source_created_at, source_updated_at
       )
     on conflict (endpoint, igdb_id) do update
       set payload = excluded.payload,
           checksum = excluded.checksum,
           source_created_at = excluded.source_created_at,
           source_updated_at = excluded.source_updated_at,
           last_seen_at = now(),
           last_seen_run_id = excluded.last_seen_run_id,
           is_active = true`,
    [endpoint, ids, payloads, checksums, sourceCreatedAt, sourceUpdatedAt, runId],
  );
}

async function getEndpointState(db, endpoint) {
  const result = await db.query(
    `select supports_updated_at, max_source_updated_at
       from igdb_raw.endpoint_state
      where endpoint = $1`,
    [endpoint],
  );
  return result.rows[0] ?? null;
}

async function beginEndpointRun(db, runId, endpoint, expectedCount, resume) {
  const existing = await db.query(
    `select status, expected_count, last_igdb_id, rows_fetched, error
       from igdb_raw.endpoint_runs
      where run_id = $1 and endpoint = $2`,
    [runId, endpoint],
  );

  if (existing.rowCount > 0 && resume) {
    if (
      existing.rows[0].status === "completed" &&
      (existing.rows[0].expected_count === null ||
        Number(existing.rows[0].rows_fetched) === Number(existing.rows[0].expected_count))
    ) {
      return { completed: true };
    }
    const restartEndpoint =
      existing.rows[0].status === "completed" ||
      existing.rows[0].error?.includes("count mismatch");
    await db.query(
      `update igdb_raw.endpoint_runs
          set status = 'running',
              expected_count = $3,
              last_igdb_id = case when $4 then -1 else last_igdb_id end,
              rows_fetched = case when $4 then 0 else rows_fetched end,
              error = null,
              finished_at = null
        where run_id = $1 and endpoint = $2`,
      [runId, endpoint, expectedCount, restartEndpoint],
    );
    return {
      completed: false,
      cursor: restartEndpoint ? -1 : Number(existing.rows[0].last_igdb_id),
      rowsFetched: restartEndpoint ? 0 : Number(existing.rows[0].rows_fetched),
    };
  }

  await db.query(
    `insert into igdb_raw.endpoint_runs (run_id, endpoint, expected_count)
     values ($1, $2, $3)
     on conflict (run_id, endpoint) do update
       set status = 'running',
           expected_count = excluded.expected_count,
           last_igdb_id = -1,
           rows_fetched = 0,
           started_at = now(),
           finished_at = null,
           error = null`,
    [runId, endpoint, expectedCount],
  );
  return { completed: false, cursor: -1, rowsFetched: 0 };
}

async function syncEndpoint(db, { endpoint, mode, runId, resume, refreshStatic }) {
  const state = await getEndpointState(db, endpoint);
  if (mode === "incremental" && !state) {
    throw new Error(`${endpoint}: no full-sync state; run a full sync first`);
  }
  if (mode === "incremental" && state.supports_updated_at === false && !refreshStatic) {
    await db.query(
      `insert into igdb_raw.endpoint_runs (run_id, endpoint, status, finished_at, error)
       values ($1, $2, 'skipped', now(), 'Endpoint has no updated_at; use --refresh-static')
       on conflict (run_id, endpoint) do update
         set status = 'skipped', finished_at = now(),
             error = 'Endpoint has no updated_at; use --refresh-static'`,
      [runId, endpoint],
    );
    console.log(`${endpoint}: skipped (no updated_at)`);
    return 0;
  }

  const effectiveMode =
    mode === "incremental" && state?.supports_updated_at === false ? "full" : mode;
  let expectedCount = effectiveMode === "full" ? await fetchEndpointCount(endpoint) : null;
  const endpointRun = await beginEndpointRun(db, runId, endpoint, expectedCount, resume);
  if (endpointRun.completed) {
    console.log(`${endpoint}: already completed in resumed run`);
    return 0;
  }

  let cursor = endpointRun.cursor;
  let rowsFetched = endpointRun.rowsFetched;
  const initialRowsFetched = rowsFetched;
  const threshold = effectiveMode === "incremental" ? Number(state.max_source_updated_at ?? 0) : null;
  console.log(
    `${endpoint}: ${effectiveMode} starting at id ${cursor}` +
      (expectedCount === null ? `, updated_at > ${threshold}` : `, ${expectedCount.toLocaleString()} expected`),
  );

  for (;;) {
    const predicates = [`id > ${cursor}`];
    if (threshold !== null) predicates.unshift(`updated_at > ${threshold}`);
    const rows = await igdbRequest(
      endpoint,
      `fields *; where ${predicates.join(" & ")}; sort id asc; limit ${PAGE_SIZE};`,
    );
    if (rows.length === 0) break;

    await upsertPage(db, endpoint, rows, runId);
    cursor = rows[rows.length - 1].id;
    rowsFetched += rows.length;
    await db.query(
      `update igdb_raw.endpoint_runs
          set last_igdb_id = $3, rows_fetched = $4
        where run_id = $1 and endpoint = $2`,
      [runId, endpoint, cursor, rowsFetched],
    );

    if (rowsFetched % PROGRESS_EVERY < PAGE_SIZE) {
      const expected = expectedCount === null ? "" : `/${expectedCount.toLocaleString()}`;
      console.log(`${endpoint}: ${rowsFetched.toLocaleString()}${expected} rows`);
    }
  }

  if (effectiveMode === "full" && rowsFetched !== expectedCount) {
    const refreshedCount = await fetchEndpointCount(endpoint);
    if (rowsFetched !== refreshedCount) {
      const coverage = refreshedCount === 0 ? 1 : rowsFetched / refreshedCount;
      if (!VOLATILE_ENDPOINTS.has(endpoint) || coverage < 0.999) {
        throw new Error(
          `${endpoint}: count mismatch, fetched ${rowsFetched.toLocaleString()} of ${refreshedCount.toLocaleString()} ` +
            `(initial count ${expectedCount.toLocaleString()})`,
        );
      }
      console.warn(
        `${endpoint}: accepting volatile snapshot with ${(coverage * 100).toFixed(4)}% coverage; ` +
          "the next incremental sync will capture newer rows",
      );
      expectedCount = rowsFetched;
    } else {
      expectedCount = refreshedCount;
    }
    await db.query(
      `update igdb_raw.endpoint_runs
          set expected_count = $3
        where run_id = $1 and endpoint = $2`,
      [runId, endpoint, expectedCount],
    );
  }

  if (effectiveMode === "full") {
    await db.query(
      `update igdb_raw.entities
          set is_active = false
        where endpoint = $1
          and is_active
          and last_seen_run_id <> $2`,
      [endpoint, runId],
    );
  }

  await db.query("begin");
  try {
    await db.query(
      `update igdb_raw.endpoint_runs
          set status = 'completed', finished_at = now()
        where run_id = $1 and endpoint = $2`,
      [runId, endpoint],
    );
    await db.query(
      `insert into igdb_raw.endpoint_state (
         endpoint, supports_updated_at, active_rows, max_source_updated_at,
         last_full_sync_at, last_incremental_sync_at, last_successful_run_id
       )
       select $1,
              bool_or(payload ? 'updated_at'),
              count(*) filter (where is_active),
              max(source_updated_at),
              case when $3 = 'full' then now() else null end,
              case when $3 = 'incremental' then now() else null end,
              $2::uuid
         from igdb_raw.entities
        where endpoint = $1
       on conflict (endpoint) do update
         set supports_updated_at = excluded.supports_updated_at,
             active_rows = excluded.active_rows,
             max_source_updated_at = excluded.max_source_updated_at,
             last_full_sync_at = coalesce(excluded.last_full_sync_at, igdb_raw.endpoint_state.last_full_sync_at),
             last_incremental_sync_at = coalesce(excluded.last_incremental_sync_at, igdb_raw.endpoint_state.last_incremental_sync_at),
             last_successful_run_id = excluded.last_successful_run_id,
             updated_at = now()`,
      [endpoint, runId, effectiveMode],
    );
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }

  console.log(`${endpoint}: completed with ${rowsFetched.toLocaleString()} rows`);
  return rowsFetched - initialRowsFetched;
}

async function recordEndpointFailure(db, runId, endpoint, error) {
  const message = error instanceof Error ? error.message : String(error);
  await db.query(
    `insert into igdb_raw.endpoint_runs (run_id, endpoint, status, finished_at, error)
     values ($1, $2, 'failed', now(), $3)
     on conflict (run_id, endpoint) do update
       set status = 'failed', finished_at = now(), error = excluded.error`,
    [runId, endpoint, message],
  );
  await db.query(
    `update igdb_raw.sync_runs
        set errors = errors || jsonb_build_array(
          jsonb_build_object('endpoint', $2::text, 'error', $3::text)
        )
      where id = $1`,
    [runId, endpoint, message],
  );
}

async function main() {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.IGDB_CLIENT_ID || !process.env.IGDB_CLIENT_SECRET) {
    throw new Error("IGDB_CLIENT_ID and IGDB_CLIENT_SECRET are required");
  }

  const endpoints = args.endpoints ?? ENDPOINTS;
  const db = new Client({ connectionString: process.env.IGDB_MIRROR_DB_URL ?? DEFAULT_DB_URL });
  await db.connect();

  let runId = null;
  try {
    await ensureSchema(db);
    const run = await getOrCreateRun(db, args, endpoints);
    runId = run.runId;
    console.log(
      `IGDB mirror run ${runId}: mode=${args.mode}, endpoints=${endpoints.length}` +
        (run.resumed ? " (resumed)" : ""),
    );

    let totalFetched = 0;
    let failures = 0;
    for (const endpoint of endpoints) {
      try {
        totalFetched += await syncEndpoint(db, {
          endpoint,
          mode: args.mode,
          runId,
          resume: run.resumed,
          refreshStatic: args.refreshStatic,
        });
      } catch (error) {
        failures += 1;
        console.error(`${endpoint}: FAILED: ${error.message}`);
        await recordEndpointFailure(db, runId, endpoint, error);
        if (!args.continueOnError) throw error;
      }
    }

    const finalStatus = failures === 0 ? "completed" : "completed_with_errors";
    await db.query(
      `update igdb_raw.sync_runs
          set status = $2,
              finished_at = now(),
              rows_fetched = (
                select coalesce(sum(rows_fetched), 0)
                  from igdb_raw.endpoint_runs
                 where run_id = $1
              )
        where id = $1`,
      [runId, finalStatus],
    );
    console.log(
      `IGDB mirror run ${runId}: ${finalStatus}; ${totalFetched.toLocaleString()} rows fetched this process`,
    );
    if (failures > 0) process.exitCode = 1;
  } catch (error) {
    if (runId) {
      await db.query(
        `update igdb_raw.sync_runs set status = 'failed', finished_at = now() where id = $1`,
        [runId],
      );
    }
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
