import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { buildAdaptiveProfile } from "../packages/core/src/domain/onboarding";
import type {
  ProductOnboardingDraft,
  ProductStartedActionType,
  ProductTasteActionType,
} from "../packages/core/src/types";

const supabaseStatus = execFileSync("supabase", ["status", "-o", "env"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
});

function statusValue(name: string) {
  const match = supabaseStatus.match(new RegExp(`^${name}="([^"]+)"$`, "m"));
  if (!match) throw new Error(`Missing ${name} in local Supabase status`);
  return match[1];
}

const supabaseUrl = statusValue("API_URL");
const anonKey = statusValue("ANON_KEY");
const serviceRoleKey = statusValue("SERVICE_ROLE_KEY");
if (!supabaseUrl.startsWith("http://127.0.0.1:")) {
  throw new Error(`Refusing to validate against a non-local Supabase URL: ${supabaseUrl}`);
}

execFileSync(
  "docker",
  [
    "exec",
    "supabase_db_games-library",
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `
      insert into games_library.genres (id, name)
      values ('action', 'Action'), ('adventure', 'Adventure')
      on conflict do nothing;
      insert into games_library.tags (id, name)
      values
        ('fast_paced', 'Fast-paced'),
        ('exploration', 'Exploration'),
        ('story_rich', 'Story Rich'),
        ('horror', 'Horror')
      on conflict do nothing;
      insert into games_library.platforms (id, name, family, vendor, kind, gen)
      values ('pc', 'PC', 'pc', 'Other', 'computer', 0)
      on conflict do nothing;
      insert into games_library.games (
        game_id, title, release_year, release_state, source_type, source_ref,
        cover_url, tags, genre_id, genre_ref, platforms, playtime
      )
      select
        fixture.game_id,
        fixture.title,
        2026,
        'released',
        'catalog',
        'undo-local-fixture',
        '',
        fixture.tags,
        fixture.genre_id,
        genre.pk,
        array['pc']::text[],
        fixture.playtime
      from (values
        ('action-game', 'Action Game', array['fast_paced', 'story_rich']::text[], 'action', 10),
        ('candidate-fast', 'Candidate Fast', array['fast_paced']::text[], 'action', 12),
        ('candidate-story', 'Candidate Story', array['story_rich', 'exploration']::text[], 'adventure', 20),
        ('candidate-horror', 'Candidate Horror', array['horror']::text[], 'adventure', 8)
      ) as fixture(game_id, title, tags, genre_id, playtime)
      join games_library.genres genre on genre.id = fixture.genre_id
      on conflict (game_id) do update set
        title = excluded.title,
        tags = excluded.tags,
        genre_id = excluded.genre_id,
        genre_ref = excluded.genre_ref,
        platforms = excluded.platforms;
    `,
  ],
  { stdio: "ignore" },
);

const appUrl = process.env.PLAYFIT_LOCAL_APP_URL ?? "http://127.0.0.1:3000";
const onboarding: ProductOnboardingDraft = {
  step: "dislikes",
  platforms: [{ platformId: "pc", status: "available" }],
  likedGameIds: [],
  dislikedGameIds: [],
};
const initialProfile = buildAdaptiveProfile(onboarding, new Map(), {});

type JsonResponse = { status: number; body: Record<string, any> };

async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<JsonResponse> {
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

async function createLocalUser(label: string) {
  const email = `undo-${label}-${Date.now()}-${crypto.randomUUID()}@playfit.local`;
  const password = "Local-undo-validation-2026!";
  const created = await post(
    `${supabaseUrl}/auth/v1/admin/users`,
    {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    { email, password, email_confirm: true },
  );
  if (created.status !== 200)
    throw new Error(`Failed to create local user: ${JSON.stringify(created)}`);

  const login = await post(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    { apikey: anonKey, "content-type": "application/json" },
    { email, password },
  );
  if (login.status !== 200)
    throw new Error(`Failed to sign in local user: ${JSON.stringify(login)}`);
  return {
    userId: created.body.id as string,
    headers: {
      Authorization: `Bearer ${login.body.access_token}`,
      "content-type": "application/json",
    },
  };
}

async function initializeProfile(
  headers: Record<string, string>,
  gameStates: Record<string, unknown> = {},
) {
  const saved = await post(`${appUrl}/api/profile`, headers, {
    gameStates,
    stateVersion: "0",
    profile: initialProfile,
    onboarding: {
      ...onboarding,
      onboardingCompletedAt: "2026-08-18T00:00:00.000Z",
    },
  });
  if (saved.status !== 200 || saved.body.stateVersion !== "1") {
    throw new Error(`Failed to initialize profile: ${JSON.stringify(saved)}`);
  }
  const baseline = await fetch(`${appUrl}/api/profile`, { headers });
  const baselineBody = await baseline.json();
  const ranking = await post(`${appUrl}/api/recommendations/today`, headers, {});
  return { state: baselineBody.state, ranking: ranking.body };
}

function canonicalProfile(profile: unknown) {
  return profile;
}

function semanticGameStates(gameStates: Record<string, any> | undefined) {
  return Object.fromEntries(
    Object.entries(gameStates ?? {}).map(([gameId, gameState]) => {
      const { createdAt: _createdAt, updatedAt: _updatedAt, ...semanticState } = gameState;
      return [gameId, semanticState];
    }),
  );
}

function candidateIds(model: Record<string, any>) {
  return (model.rankingMetadata?.candidates ?? []).map((entry: { gameId: string }) => entry.gameId);
}

async function validateActionUndo(
  actionType: ProductTasteActionType | ProductStartedActionType,
  gameId: string,
  played = false,
  startsFromPick = false,
) {
  const user = await createLocalUser(actionType);
  const baseline = await initializeProfile(
    user.headers,
    startsFromPick
      ? {
          [gameId]: {
            gameId,
            title: "Action Game",
            inBacklog: false,
            inWishlist: false,
            inPlayfitPicks: true,
            excluded: false,
            source: "manual",
            createdAt: "2026-08-18T00:00:00.000Z",
            updatedAt: "2026-08-18T00:00:00.000Z",
          },
        }
      : {},
  );
  const targetOperationId = crypto.randomUUID();
  const decision = await post(`${appUrl}/api/decisions`, user.headers, {
    operationId: targetOperationId,
    expectedStateVersion: "1",
    actionType,
    gameId,
    ...(actionType === "started" ? {} : { played }),
  });
  if (decision.status !== 200 || decision.body.stateVersion !== "2") {
    throw new Error(`${actionType} failed: ${JSON.stringify(decision)}`);
  }
  if (actionType === "mixed") {
    const mixedProfileUnchanged = isDeepStrictEqual(
      canonicalProfile(decision.body.state.user.profile),
      canonicalProfile(baseline.state.profile),
    );
    if (
      !mixedProfileUnchanged ||
      decision.body.gameState.rating !== 3 ||
      decision.body.gameState.status !== "completed" ||
      decision.body.gameState.excluded === true
    ) {
      throw new Error(`Mixed invariant failed: ${JSON.stringify(decision.body)}`);
    }
  }
  if (actionType === "started") {
    const profileUnchanged = isDeepStrictEqual(
      canonicalProfile(decision.body.state.user.profile),
      canonicalProfile(baseline.state.profile),
    );
    const wasCandidate = candidateIds(baseline.ranking).includes(gameId);
    const candidateSetChanged =
      !wasCandidate || !candidateIds(decision.body.recommendationModel).includes(gameId);
    if (
      !profileUnchanged ||
      decision.body.gameState.status !== "playing" ||
      decision.body.gameState.rating != null ||
      decision.body.gameState.inPlayfitPicks !== false ||
      !candidateSetChanged
    ) {
      throw new Error(`Started invariant failed: ${JSON.stringify(decision.body)}`);
    }
  }
  if (
    actionType === "dropped" &&
    (decision.body.gameState.rating !== 2 ||
      decision.body.gameState.status !== "abandoned" ||
      decision.body.gameState.excluded !== true)
  ) {
    throw new Error(`Dropped invariant failed: ${JSON.stringify(decision.body)}`);
  }

  const undoOperationId = crypto.randomUUID();
  const undoRequest = {
    operationId: undoOperationId,
    expectedStateVersion: "2",
    actionType: "undo_decision",
    targetOperationId,
  };
  const undo = await post(`${appUrl}/api/decisions`, user.headers, undoRequest);
  if (undo.status !== 200 || undo.body.stateVersion !== "3") {
    throw new Error(`${actionType} Undo failed: ${JSON.stringify(undo)}`);
  }

  const replay = await post(`${appUrl}/api/decisions`, user.headers, undoRequest);
  const profileEquivalent = isDeepStrictEqual(
    canonicalProfile(undo.body.state.user.profile),
    canonicalProfile(baseline.state.profile),
  );
  const gameStatesEquivalent = isDeepStrictEqual(
    semanticGameStates(undo.body.state.user.gameStates),
    semanticGameStates(baseline.state.game_states),
  );
  const baselineCandidateIds = candidateIds(baseline.ranking);
  const undoCandidateIds = candidateIds(undo.body.recommendationModel);
  const rankingOrderEquivalent =
    JSON.stringify(undoCandidateIds) === JSON.stringify(baselineCandidateIds);
  const rankingEquivalent =
    JSON.stringify([...undoCandidateIds].sort()) ===
    JSON.stringify([...baselineCandidateIds].sort());
  const versionInvariant =
    undo.body.stateVersion === undo.body.profile.stateVersion &&
    undo.body.stateVersion === undo.body.recommendationModel.stateVersion &&
    undo.body.stateVersion === undo.body.recommendationModel.rankingMetadata.profileStateVersion;

  if (!profileEquivalent || !gameStatesEquivalent || !rankingEquivalent || !versionInvariant) {
    throw new Error(
      `${actionType} semantic equivalence failed: ${JSON.stringify({
        profileEquivalent,
        gameStatesEquivalent,
        rankingEquivalent,
        versionInvariant,
        baselineProfile: baseline.state.profile,
        undoProfile: undo.body.state.user.profile,
        baselineGameStates: baseline.state.game_states,
        undoGameStates: undo.body.state.user.gameStates,
        baselineRanking: baselineCandidateIds,
        undoRanking: undoCandidateIds,
      })}`,
    );
  }
  if (replay.status !== 200 || replay.body.stateVersion !== "3") {
    throw new Error(`${actionType} Undo replay failed: ${JSON.stringify(replay)}`);
  }

  return {
    actionType,
    startsFromPick,
    userId: user.userId,
    versions: ["1", "2", "3"],
    actionRating: decision.body.gameState.rating,
    actionStatus: decision.body.gameState.status ?? null,
    profileEquivalent,
    gameStatesEquivalent,
    rankingEquivalent,
    rankingOrderEquivalent,
    versionInvariant,
    replayStateVersion: replay.body.stateVersion,
  };
}

async function validateConflicts() {
  const user = await createLocalUser("conflicts");
  await initializeProfile(user.headers);
  const firstOperationId = crypto.randomUUID();
  const first = await post(`${appUrl}/api/decisions`, user.headers, {
    operationId: firstOperationId,
    expectedStateVersion: "1",
    actionType: "not_for_me",
    gameId: "action-game",
  });
  const stale = await post(`${appUrl}/api/decisions`, user.headers, {
    operationId: crypto.randomUUID(),
    expectedStateVersion: "1",
    actionType: "undo_decision",
    targetOperationId: firstOperationId,
  });
  const second = await post(`${appUrl}/api/decisions`, user.headers, {
    operationId: crypto.randomUUID(),
    expectedStateVersion: "2",
    actionType: "liked",
    gameId: "candidate-story",
  });
  const afterLater = await post(`${appUrl}/api/decisions`, user.headers, {
    operationId: crypto.randomUUID(),
    expectedStateVersion: "3",
    actionType: "undo_decision",
    targetOperationId: firstOperationId,
  });
  const persisted = await fetch(`${appUrl}/api/profile`, { headers: user.headers });
  const persistedBody = await persisted.json();

  if (
    first.status !== 200 ||
    stale.status !== 409 ||
    second.status !== 200 ||
    afterLater.status !== 409
  ) {
    throw new Error(`Undo conflict behavior failed`);
  }
  if (String(persistedBody.state.state_version) !== "3") {
    throw new Error(`Conflict validation changed the profile unexpectedly`);
  }
  return {
    staleStatus: stale.status,
    staleVersion: stale.body.currentStateVersion,
    afterLaterStatus: afterLater.status,
    undoUnavailable: afterLater.body.undoUnavailable === true,
    persistedVersion: String(persistedBody.state.state_version),
  };
}

const results = [
  await validateActionUndo("not_for_me", "action-game"),
  await validateActionUndo("loved", "candidate-fast", true),
  await validateActionUndo("liked", "candidate-story", true),
  await validateActionUndo("mixed", "candidate-fast", true),
  await validateActionUndo("dropped", "candidate-horror", true),
  await validateActionUndo("started", "action-game"),
  await validateActionUndo("started", "action-game", false, true),
];
const conflicts = await validateConflicts();
console.log(JSON.stringify({ database: supabaseUrl, results, conflicts }, null, 2));
