import { expect, type Page, test } from "@playwright/test";

test.setTimeout(45_000);

const gameRows = [
  {
    game_id: "chrono_trigger",
    title: "Chrono Trigger",
    aliases: [],
    series_id: "chrono",
    genre_id: "jrpg",
    release_year: "1995",
    release_state: "released",
    source_type: "catalog",
    source_ref: "fixture",
    cover_url: "",
    tags: ["story_rich", "time_travel", "turn_based"],
    notes: "",
    sort_date: "1995-03-11",
    release_label: "1995",
  },
  {
    game_id: "metroid_prime",
    title: "Metroid Prime",
    aliases: [],
    series_id: "metroid",
    genre_id: "adventure",
    release_year: "2002",
    release_state: "released",
    source_type: "catalog",
    source_ref: "fixture",
    cover_url: "",
    tags: ["exploration", "atmospheric", "first_person"],
    notes: "",
    sort_date: "2002-11-18",
    release_label: "2002",
  },
  {
    game_id: "zelda_tears",
    title: "The Legend of Zelda: Tears of the Kingdom",
    aliases: ["Zelda Tears"],
    series_id: "the_legend_of_zelda",
    genre_id: "adventure",
    release_year: "2023",
    release_state: "released",
    source_type: "catalog",
    source_ref: "fixture",
    cover_url: "",
    tags: ["open_world", "exploration", "systems"],
    notes: "",
    sort_date: "2023-05-12",
    release_label: "2023",
  },
  {
    game_id: "hollow_knight_silksong",
    title: "Hollow Knight: Silksong",
    aliases: [],
    series_id: "hollow_knight",
    genre_id: "metroidvania",
    release_year: "",
    release_state: "unreleased",
    source_type: "catalog",
    source_ref: "fixture",
    cover_url: "",
    tags: ["precision", "exploration"],
    notes: "",
    sort_date: "2026-12-31",
    release_label: "2026",
  },
  {
    game_id: "resident_evil_4",
    title: "Resident Evil 4",
    aliases: [],
    series_id: "resident_evil",
    genre_id: "horror",
    release_year: "2005",
    release_state: "released",
    source_type: "catalog",
    source_ref: "fixture",
    cover_url: "",
    tags: ["horror", "action", "tense"],
    notes: "",
    sort_date: "2005-01-11",
    release_label: "2005",
  },
  {
    game_id: "final_fantasy_vi",
    title: "Final Fantasy VI",
    aliases: ["FF6"],
    series_id: "final_fantasy",
    genre_id: "jrpg",
    release_year: "1994",
    release_state: "released",
    source_type: "catalog",
    source_ref: "fixture",
    cover_url: "",
    tags: ["story_rich", "turn_based", "fantasy"],
    notes: "",
    sort_date: "1994-04-02",
    release_label: "1994",
  },
];

const platformRows = [
  {
    id: "switch_2",
    name: "Nintendo Switch 2",
    rawg_id: null,
    family: "nintendo",
    vendor: "nintendo",
    kind: "hybrid",
    gen: 9,
  },
];

const gamePlatformRows = [
  { game_id: "chrono_trigger", platform_id: "switch_2" },
  { game_id: "metroid_prime", platform_id: "switch_2" },
  { game_id: "zelda_tears", platform_id: "switch_2" },
  { game_id: "hollow_knight_silksong", platform_id: "switch_2" },
  { game_id: "resident_evil_4", platform_id: "switch_2" },
  { game_id: "final_fantasy_vi", platform_id: "switch_2" },
];

const seriesRows = [
  { id: "chrono", name: "Chrono" },
  { id: "metroid", name: "Metroid" },
  { id: "the_legend_of_zelda", name: "The Legend of Zelda" },
  { id: "hollow_knight", name: "Hollow Knight" },
  { id: "resident_evil", name: "Resident Evil" },
  { id: "final_fantasy", name: "Final Fantasy" },
];

function seedGame(row: (typeof gameRows)[number]) {
  return {
    gameId: row.game_id,
    title: row.title,
    aliases: row.aliases,
    series: row.series_id,
    seriesId: row.series_id,
    source: "catalog",
    primaryGenre: row.genre_id,
    genreId: row.genre_id,
    tags: row.tags,
    notes: row.notes,
    coverPath: "",
    releaseYear: row.release_year,
    sourceRef: row.source_ref,
    availablePlatformIds: ["switch_2"],
    availablePlatformNames: ["Nintendo Switch 2"],
    releaseState: row.release_state,
    sortDate: row.sort_date,
    releaseLabel: row.release_label,
  };
}

function rankedGame(row: (typeof gameRows)[number], affinityScore = 82) {
  return {
    game: seedGame(row),
    affinityScore,
    riskScore: 12,
    confidence: "medium",
    fitReasons: ["Matches your early taste signals."],
    cautionReasons: [],
    platformAvailability: "available",
    accessStatus: "playable",
    inBacklog: false,
    inWishlist: false,
    inPlayfitPicks: false,
    similarGames: [],
  };
}

async function mockSupabase(page: Page) {
  const savedProfiles: unknown[] = [];
  let latestProfile: unknown = null;

  await page.route("**/rest/v1/games**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(gameRows),
    }),
  );
  await page.route("**/rest/v1/game_platforms**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(gamePlatformRows),
    }),
  );
  await page.route("**/rest/v1/platforms**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(platformRows),
    }),
  );
  await page.route("**/rest/v1/game_tags**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify([]),
    }),
  );
  await page.route("**/rest/v1/game_aliases**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify([]),
    }),
  );
  await page.route("**/rest/v1/series**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(seriesRows),
    }),
  );
  await page.route("**/api/games/batch", async (route) => {
    const { gameIds } = route.request().postDataJSON() as { gameIds: string[] };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        games: gameRows.filter((row) => gameIds.includes(row.game_id)).map(seedGame),
      }),
    });
  });
  await page.route("**/api/games?**", async (route) => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get("q")?.toLowerCase() ?? "";
    const games = gameRows
      .filter((row) => {
        const haystack = [row.title, row.game_id, ...row.aliases].join(" ").toLowerCase();
        return haystack.includes(query);
      })
      .map(seedGame);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ games }),
    });
  });
  await page.route("**/api/recommendations/today", async (route) => {
    const body = route.request().postDataJSON() as {
      gameStates?: Record<string, { excluded?: boolean; inPlayfitPicks?: boolean; status?: string }>;
    };
    const states = body.gameStates ?? {};
    const terminal = new Set(
      Object.entries(body.gameStates ?? {})
        .filter(([, state]) => {
          return (
            state.excluded === true ||
            state.status === "completed" ||
            state.status === "beaten" ||
            state.status === "abandoned"
          );
        })
        .map(([gameId]) => gameId),
    );
    const picked = new Set(
      Object.entries(states)
        .filter(([gameId, state]) => state.inPlayfitPicks === true && !terminal.has(gameId))
        .map(([gameId]) => gameId),
    );
    const nextUp = [gameRows[5], gameRows[3]].filter(
      (row) => !terminal.has(row.game_id) && !picked.has(row.game_id),
    );
    const picks = [gameRows[5], gameRows[3]]
      .filter((row) => picked.has(row.game_id) && !terminal.has(row.game_id))
      .map((row, index) => ({
        ...rankedGame(row, index === 0 ? 82 : 74),
        inPlayfitPicks: true,
      }));

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        currentRun: [],
        nextUp: nextUp.map((row, index) => rankedGame(row, index === 0 ? 82 : 74)),
        resume: [],
        picks,
      }),
    });
  });
  await page.route("**/api/recommendations/profile", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        profile: {
          summary: "E2E profile",
          likedGenres: ["jrpg", "adventure"],
          avoidedGenres: ["horror"],
          likedTags: { story_rich: 2, exploration: 2 },
          dislikedTags: { horror: 1 },
          ratedCount: 4,
          signals: [],
        },
      }),
    });
  });
  await page.route("**/api/profile**", async (route) => {
    if (route.request().method() === "POST") {
      latestProfile = route.request().postDataJSON();
      savedProfiles.push(latestProfile);
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
      return;
    }

    if (latestProfile) {
      const profile = latestProfile as {
        gameStates?: unknown;
        onboarding?: unknown;
        profile?: unknown;
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          state: {
            onboarding: profile.onboarding,
            profile: profile.profile,
            game_states: profile.gameStates,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"state":null}',
    });
  });

  return savedProfiles;
}

async function advanceFromPlatformStep(page: Page) {
  await expect(page.getByRole("heading", { name: "Where can Playfit look?" })).toBeVisible();
  const selectAll = page.getByText("Select all platforms", { exact: true });
  const continueButton = page.getByRole("button", { name: /Continue/ });

  await expect(selectAll).toBeVisible();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await selectAll.click();
    if (await continueButton.isEnabled()) break;
    await page.waitForTimeout(250);
  }

  await expect(continueButton).toBeEnabled();
  await continueButton.click();
}

test("public home and health endpoint load", async ({ page, request }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Know your next game before you start it." }),
  ).toBeVisible();

  const health = await request.get("/api/health");
  await expect(health).toBeOK();
  await expect(health.json()).resolves.toMatchObject({ ok: true, app: "playfit" });
});

test("anonymous local profile can complete setup and save by device id", async ({ page }) => {
  const savedProfiles = await mockSupabase(page);

  await page.goto("/play");

  await expect(page.getByRole("heading", { name: "Find what to play next" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Where can Playfit look?" })).toBeVisible();
  await advanceFromPlatformStep(page);

  await expect(page.getByRole("heading", { name: "Pick three games you loved" })).toBeVisible();
  await page.getByLabel("Search by title or series").fill("Chrono");
  await page.getByRole("button", { name: /Chrono Trigger/ }).click();
  await page.getByLabel("Search by title or series").fill("Metroid");
  await page.getByRole("button", { name: /Metroid Prime/ }).click();
  await page.getByLabel("Search by title or series").fill("Tears");
  await page.getByRole("button", { name: /Tears of the Kingdom/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();

  await expect(
    page.getByRole("heading", { name: "Pick one game that was not for you" }),
  ).toBeVisible();
  await page.getByLabel("Search for a game that missed for you").fill("Resident Evil");
  await page.getByRole("button", { name: /Resident Evil 4/ }).click();
  await expect(page.getByText("1 / 1 not for me")).toBeVisible();
  await page.getByRole("button", { name: "Find Play Next" }).click();

  await expect(page.getByText("Play this next")).toBeVisible();
  await expect.poll(() => savedProfiles.length).toBeGreaterThan(0);
  const completedProfile = [...savedProfiles].reverse().find((profile) => {
    return (profile as { onboarding?: { onboardingCompletedAt?: string } }).onboarding
      ?.onboardingCompletedAt;
  });

  expect(completedProfile).toMatchObject({
    deviceId: expect.any(String),
    onboarding: expect.objectContaining({
      step: "dislikes",
      dislikedGameIds: ["resident_evil_4"],
    }),
    gameStates: expect.objectContaining({
      chrono_trigger: expect.objectContaining({ source: "onboarding" }),
    }),
  });
});

test("play route loads locally without mandatory sign in", async ({ page }) => {
  await mockSupabase(page);

  await page.goto("/play");

  await expect(page.getByRole("heading", { name: "Where can Playfit look?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue locally" })).toHaveCount(0);
});

test("play dossier direct link fetches a valid game before asking for taste", async ({ page }) => {
  await mockSupabase(page);

  await page.goto("/play/game/metroid_prime");

  await expect(page.getByRole("heading", { name: "Tune your taste first" })).toBeVisible();
  await expect(page.getByText("Game not found")).toHaveCount(0);
});

test("picks route asks new users to tune taste first", async ({ page }) => {
  await mockSupabase(page);

  await page.goto("/play/picks");

  await expect(page.getByRole("heading", { name: "Tune your taste first" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start Play Next" })).toBeVisible();
});

test("taste route explains onboarding signals and lets users remove one", async ({ page }) => {
  await mockSupabase(page);

  await page.goto("/play");
  await advanceFromPlatformStep(page);
  await page.getByLabel("Search by title or series").fill("Chrono");
  await page.getByRole("button", { name: /Chrono Trigger/ }).click();
  await page.getByLabel("Search by title or series").fill("Metroid");
  await page.getByRole("button", { name: /Metroid Prime/ }).click();
  await page.getByLabel("Search by title or series").fill("Tears");
  await page.getByRole("button", { name: /Tears of the Kingdom/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByLabel("Search for a game that missed for you").fill("Resident Evil");
  await page.getByRole("button", { name: /Resident Evil 4/ }).click();
  await page.getByRole("button", { name: "Find Play Next" }).click();

  await Promise.all([
    page.waitForURL(/\/play\/taste$/, { timeout: 15_000 }),
    page.getByRole("link", { name: "Taste" }).click(),
  ]);

  await expect(page).toHaveURL(/\/play\/taste$/);
  await expect(page.getByRole("heading", { name: "Your Taste" })).toBeVisible();
  await expect(page.getByText("Taste Map")).toBeVisible();
  await expect(page.getByText("Taste History")).toBeVisible();
  await expect(page.getByText("Setup favorite", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Setup miss", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Lean toward", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Steer away from", { exact: true }).first()).toBeVisible();

  await Promise.all([
    page.waitForURL(/\/play\/game\//, { timeout: 15_000 }),
    page.getByRole("link", { name: /Open dossier/ }).first().click(),
  ]);
  await Promise.all([
    page.waitForURL(/\/play\/taste$/, { timeout: 15_000 }),
    page.getByRole("link", { name: "Your Taste" }).click(),
  ]);

  await page.getByRole("button", { name: "Remove signal" }).first().click();
  await expect(page.getByText("Taste is below calibration strength")).toBeVisible();
});

test("playfit picks saves a recommendation and moves it to started", async ({ page }) => {
  const savedProfiles = await mockSupabase(page);

  await page.goto("/play");
  await advanceFromPlatformStep(page);
  await page.getByLabel("Search by title or series").fill("Chrono");
  await page.getByRole("button", { name: /Chrono Trigger/ }).click();
  await page.getByLabel("Search by title or series").fill("Metroid");
  await page.getByRole("button", { name: /Metroid Prime/ }).click();
  await page.getByLabel("Search by title or series").fill("Tears");
  await page.getByRole("button", { name: /Tears of the Kingdom/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByLabel("Search for a game that missed for you").fill("Resident Evil");
  await page.getByRole("button", { name: /Resident Evil 4/ }).click();
  await page.getByRole("button", { name: "Find Play Next" }).click();

  await expect(page.getByRole("heading", { name: "Final Fantasy VI" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to Playfit Picks" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Maybe later" })).toHaveCount(0);
  await page.getByRole("button", { name: "Add to Playfit Picks" }).first().click();

  await expect(page.getByRole("heading", { name: "Hollow Knight: Silksong" })).toBeVisible();
  await expect
    .poll(() =>
      savedProfiles.some((profile) => {
        const gameState = (
          profile as {
            gameStates?: Record<string, { inPlayfitPicks?: boolean; status?: string }>;
          }
        ).gameStates?.final_fantasy_vi;
        return gameState?.inPlayfitPicks === true && !gameState.status;
      }),
    )
    .toBe(true);

  await Promise.all([
    page.waitForURL(/\/play\/picks$/, { timeout: 15_000 }),
    page.getByRole("link", { name: /Picks/ }).click(),
  ]);

  await expect(page.getByRole("heading", { name: "Playfit Picks" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Final Fantasy VI" })).toBeVisible();
  await page.getByRole("button", { name: "Started" }).click();

  await expect
    .poll(() =>
      savedProfiles.some((profile) => {
        const gameState = (
          profile as {
            gameStates?: Record<string, { inPlayfitPicks?: boolean; status?: string }>;
          }
        ).gameStates?.final_fantasy_vi;
        return gameState?.status === "playing" && gameState.inPlayfitPicks === false;
      }),
    )
    .toBe(true);
  await expect(page.getByText("No Playfit Picks yet")).toBeVisible();
});

test("play next feedback excludes a bad fit", async ({ page }) => {
  const savedProfiles = await mockSupabase(page);

  await page.goto("/play");
  await advanceFromPlatformStep(page);
  await page.getByLabel("Search by title or series").fill("Chrono");
  await page.getByRole("button", { name: /Chrono Trigger/ }).click();
  await page.getByLabel("Search by title or series").fill("Metroid");
  await page.getByRole("button", { name: /Metroid Prime/ }).click();
  await page.getByLabel("Search by title or series").fill("Tears");
  await page.getByRole("button", { name: /Tears of the Kingdom/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByLabel("Search for a game that missed for you").fill("Resident Evil");
  await page.getByRole("button", { name: /Resident Evil 4/ }).click();
  await expect(page.getByText("1 / 1 not for me")).toBeVisible();
  await page.getByRole("button", { name: "Find Play Next" }).click();

  await expect(page.getByText("Play this next")).toBeVisible();
  await Promise.all([
    page.waitForURL(/\/play\/game\//, { timeout: 15_000 }),
    page.getByRole("link", { name: "See why" }).first().click(),
  ]);
  await Promise.all([
    page.waitForURL(/\/play$/, { timeout: 15_000 }),
    page.getByRole("link", { name: "Back to Play Next" }).click(),
  ]);
  await page.getByRole("button", { name: "Not for me" }).first().click();

  await expect
    .poll(() =>
      savedProfiles.some((profile) =>
        Object.values(
          (profile as { gameStates?: Record<string, { excluded?: boolean; rating?: number }> })
            .gameStates ?? {},
        ).some((state) => state.excluded === true && state.rating === 2),
      ),
    )
    .toBe(true);
});

test("already played loved marks completed and rotates the recommendation", async ({ page }) => {
  const savedProfiles = await mockSupabase(page);

  await page.goto("/play");
  await advanceFromPlatformStep(page);
  await page.getByLabel("Search by title or series").fill("Chrono");
  await page.getByRole("button", { name: /Chrono Trigger/ }).click();
  await page.getByLabel("Search by title or series").fill("Metroid");
  await page.getByRole("button", { name: /Metroid Prime/ }).click();
  await page.getByLabel("Search by title or series").fill("Tears");
  await page.getByRole("button", { name: /Tears of the Kingdom/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByLabel("Search for a game that missed for you").fill("Resident Evil");
  await page.getByRole("button", { name: /Resident Evil 4/ }).click();
  await page.getByRole("button", { name: "Find Play Next" }).click();

  await expect(page.getByRole("heading", { name: "Final Fantasy VI" })).toBeVisible();
  await page.getByRole("button", { name: "Already played" }).first().click();
  await page.getByRole("button", { name: "Loved it" }).click();

  await expect(page.getByRole("heading", { name: "Hollow Knight: Silksong" })).toBeVisible();
  await expect
    .poll(() =>
      savedProfiles.some((profile) => {
        const gameState = (
          profile as {
            gameStates?: Record<string, { rating?: number; status?: string; excluded?: boolean }>;
          }
        ).gameStates?.final_fantasy_vi;
        return gameState?.status === "completed" && gameState.rating === 5 && !gameState.excluded;
      }),
    )
    .toBe(true);

  await Promise.all([
    page.waitForURL(/\/play\/taste$/, { timeout: 15_000 }),
    page.getByRole("link", { name: "Taste" }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "Your Taste" })).toBeVisible();
  await expect(page.getByText("Final Fantasy VI")).toBeVisible();
  await expect(page.getByText("Loved", { exact: true }).first()).toBeVisible();
});

test("already played dropped marks abandoned and stays out after reload", async ({ page }) => {
  const savedProfiles = await mockSupabase(page);

  await page.goto("/play");
  await advanceFromPlatformStep(page);
  await page.getByLabel("Search by title or series").fill("Chrono");
  await page.getByRole("button", { name: /Chrono Trigger/ }).click();
  await page.getByLabel("Search by title or series").fill("Metroid");
  await page.getByRole("button", { name: /Metroid Prime/ }).click();
  await page.getByLabel("Search by title or series").fill("Tears");
  await page.getByRole("button", { name: /Tears of the Kingdom/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByLabel("Search for a game that missed for you").fill("Resident Evil");
  await page.getByRole("button", { name: /Resident Evil 4/ }).click();
  await page.getByRole("button", { name: "Find Play Next" }).click();

  await expect(page.getByRole("heading", { name: "Final Fantasy VI" })).toBeVisible();
  await page.getByRole("button", { name: "Already played" }).first().click();
  await page.getByRole("button", { name: "Dropped it" }).click();

  await expect
    .poll(() =>
      savedProfiles.some((profile) => {
        const gameState = (
          profile as {
            gameStates?: Record<string, { rating?: number; status?: string; excluded?: boolean }>;
          }
        ).gameStates?.final_fantasy_vi;
        return (
          gameState?.status === "abandoned" && gameState.rating === 2 && gameState.excluded === true
        );
      }),
    )
    .toBe(true);

  await page.reload();

  await expect(page.getByRole("heading", { name: "Hollow Knight: Silksong" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Final Fantasy VI" })).toHaveCount(0);

  await Promise.all([
    page.waitForURL(/\/play\/taste$/, { timeout: 15_000 }),
    page.getByRole("link", { name: "Taste" }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "Your Taste" })).toBeVisible();
  await expect(page.getByText("Dropped", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Steer away from", { exact: true }).first()).toBeVisible();
});
