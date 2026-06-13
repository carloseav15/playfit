import { expect, type Page, test } from "@playwright/test";

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
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        currentRun: [],
        nextUp: [rankedGame(gameRows[5]), rankedGame(gameRows[3], 74)],
        resume: [],
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

  await expect(page.getByRole("heading", { name: "Where can Playfit look?" })).toBeVisible();
  await page.locator('label[for="select-all-platforms"]').click();
  await page.getByRole("button", { name: /Continue/ }).click();

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

test("play next feedback excludes a bad fit", async ({ page }) => {
  const savedProfiles = await mockSupabase(page);

  await page.goto("/play");
  await page.locator('label[for="select-all-platforms"]').click();
  await page.getByRole("button", { name: /Continue/ }).click();
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
  await page.getByRole("link", { name: "See why" }).first().click();
  await expect(page).toHaveURL(/\/play\/game\//);
  await page.getByRole("link", { name: "Back to Play Next" }).click();
  await expect(page).toHaveURL(/\/play$/);
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
