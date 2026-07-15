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
  const authUserId = "00000000-0000-4000-8000-000000000001";
  const getCurrentGameStates = () => {
    const profile = latestProfile as {
      gameStates?: Record<
        string,
        { excluded?: boolean; inPlayfitPicks?: boolean; status?: string }
      >;
    } | null;
    return profile?.gameStates ?? {};
  };
  const buildRecommendationFixtures = () => {
    const states = getCurrentGameStates();
    const terminal = new Set(
      Object.entries(states)
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

    return {
      nextUp: nextUp.map((row, index) => rankedGame(row, index === 0 ? 82 : 74)),
      picks,
      savedPickIds: [...picked],
    };
  };

  await page.route("**/auth/v1/signup", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "e2e-anon-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: "e2e-refresh-token",
        user: {
          id: authUserId,
          aud: "authenticated",
          role: "authenticated",
          email: "",
          app_metadata: {},
          user_metadata: {},
          identities: [],
          is_anonymous: true,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      }),
    });
  });

  await page.route("**/auth/v1/logout", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });

  await page.route("**/api/auth/mark-returning", async (route) => {
    if (route.request().method() === "DELETE") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "set-cookie": "pf_returning=; Max-Age=0; Path=/; SameSite=Lax" },
        body: '{"ok":true}',
      });
      return;
    }
    await route.continue();
  });

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
    const fixtures = buildRecommendationFixtures();

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        primary: fixtures.nextUp[0] ?? null,
        alternatives: fixtures.nextUp.slice(1, 4),
        savedPickIds: fixtures.savedPickIds,
        stateVersion: String(savedProfiles.length),
      }),
    });
  });
  await page.route("**/api/recommendations/model", async (route) => {
    const fixtures = buildRecommendationFixtures();

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        currentRun: [],
        nextUp: fixtures.nextUp,
        resume: [],
        picks: fixtures.picks,
      }),
    });
  });
  await page.route("**/api/recommendations/picks", async (route) => {
    const fixtures = buildRecommendationFixtures();

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fixtures.picks),
    });
  });
  await page.route("**/api/recommendations/game/*", async (route) => {
    const gameId = route.request().url().split("/").pop() ?? "";
    const row = gameRows.find((game) => game.game_id === gameId);
    await route.fulfill({
      status: row ? 200 : 404,
      contentType: "application/json",
      body: JSON.stringify(
        row
          ? {
              entry: rankedGame(row),
              stateVersion: String(savedProfiles.length),
            }
          : { error: "Recommendation game not found" },
      ),
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
      // Mirrors markReturningVisitor() from the real /api/profile route (mocked here, so
      // that handler never runs) — without it, "/" always renders the cold-visitor
      // marketing landing on a hard reload, even after onboarding has completed.
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "set-cookie": "pf_returning=1; Path=/; SameSite=Lax" },
        body: '{"ok":true}',
      });
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
            updated_at: String(savedProfiles.length),
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

async function openCalibration(page: Page) {
  const platformHeading = page.getByRole("heading", { name: "Where do you play?" });
  const launcher = page.getByRole("button", { name: "Find What to Play" });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await platformHeading.isVisible()) return;
    if ((await launcher.count()) > 0 && (await launcher.first().isVisible())) {
      await launcher.first().click();
    }
    await page.waitForTimeout(500);
  }
}

async function openAuthPanel(page: Page) {
  const authHeading = page.getByRole("heading", { name: "Welcome to Playfit" });
  const signIn = page.getByRole("button", { name: "Sign in" });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await authHeading.isVisible()) return;
    if (await signIn.isVisible()) await signIn.click();
    await page.waitForTimeout(250);
  }
  await expect(authHeading).toBeVisible({ timeout: 15_000 });
}

async function advanceFromPlatformStep(page: Page) {
  await openCalibration(page);
  await expect(page.getByRole("heading", { name: "Where do you play?" })).toBeVisible({
    timeout: 15_000,
  });
  const currentSystems = page.getByRole("button", { name: /Current systems/ });
  const continueButton = page.getByRole("button", { name: /Continue/ });

  await expect(currentSystems).toBeVisible();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await currentSystems.click();
    if (await continueButton.isEnabled()) break;
    await page.waitForTimeout(250);
  }

  await expect(continueButton).toBeEnabled();
  await continueButton.click();
}

async function selectLovedGame(page: Page, query: string, gameName: RegExp) {
  await page
    .getByRole("button", { name: /\+ Select/ })
    .first()
    .click();
  await page.getByLabel("Search by title").fill(query);
  const option = page.getByRole("button", { name: gameName }).first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click();
}

async function selectMissedGame(page: Page, query: string, gameName: RegExp) {
  await page.getByRole("button", { name: "Select Game" }).click();
  await page.getByLabel("Search by title").fill(query);
  const option = page.getByRole("button", { name: gameName }).first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click();
}

async function gotoApp(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

test("public home and health endpoint load", async ({ page, request }) => {
  await gotoApp(page, "/");

  await expect(
    page.getByRole("heading", { name: "Never waste your time on the wrong game again." }),
  ).toBeVisible();

  const health = await request.get("/api/health");
  await expect(health).toBeOK();
  await expect(health.json()).resolves.toMatchObject({ app: "playfit" });
});

test.describe("auth and logout navigation inventory", () => {
  test("cold visitor closes sign in back to the marketing landing", async ({ page }) => {
    await gotoApp(page, "/");
    await openAuthPanel(page);
    await page.getByRole("button", { name: "Close" }).click();

    await expect(
      page.getByRole("heading", { name: "Never waste your time on the wrong game again." }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("guest onboarding creates an anonymous auth session before calibration", async ({
    page,
  }) => {
    await mockSupabase(page);
    await gotoApp(page, "/");
    await openCalibration(page);

    await expect(page.getByRole("heading", { name: "Where do you play?" })).toBeVisible({
      timeout: 15_000,
    });
    await expect
      .poll(async () => {
        const cookie = (await page.context().cookies()).find(
          (entry) => entry.name === "sb-127-auth-token",
        );
        if (!cookie) return "";
        return Buffer.from(cookie.value.replace(/^base64-/, ""), "base64").toString("utf8");
      })
      .toContain("is_anonymous");
  });

  test("returning visitor cookie without a profile returns to the current marketing landing", async ({
    page,
  }) => {
    await page
      .context()
      .addCookies([{ name: "pf_returning", value: "1", url: "http://localhost:3107/" }]);
    await gotoApp(page, "/");

    await expect(
      page.getByRole("heading", { name: "Never waste your time on the wrong game again." }),
    ).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "Where do you play?" })).toHaveCount(0);
    await expect(page.getByText("Hades")).toHaveCount(0);
    await expect(page.getByText("Your next game")).toHaveCount(0);
  });

  test("logout clears auth markers and returns to the marketing landing", async ({ page }) => {
    await mockSupabase(page);
    await gotoApp(page, "/");
    await advanceFromPlatformStep(page);
    await selectLovedGame(page, "Chrono", /Chrono Trigger/);
    await selectLovedGame(page, "Metroid", /Metroid Prime/);
    await selectLovedGame(page, "Tears", /Tears of the Kingdom/);
    await page.getByRole("button", { name: /Continue/ }).click();
    await selectMissedGame(page, "Resident Evil", /Resident Evil 4/);
    await page.getByRole("button", { name: "Find Play Next" }).click();
    await expect(page.getByText("Play this next")).toBeVisible();

    await expect
      .poll(() => page.context().cookies("http://localhost:3107/"))
      .toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "pf_returning", value: "1" })]),
      );

    await gotoApp(page, "/settings");
    if ((page.viewportSize()?.width ?? 0) < 768) {
      await page.getByRole("button", { name: /Your Account/ }).click();
    }
    await expect(page.getByRole("button", { name: "Sign Out" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Sign Out" }).click();

    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Never waste your time on the wrong game again." }),
    ).toBeVisible();
    await expect(page.context().cookies("http://localhost:3107/")).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "pf_returning", value: "1" })]),
    );
  });

  test("legacy app aliases redirect to their current routes", async ({ page }) => {
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/$/);

    await page.goto("/app/settings", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("incomplete profile routes redirect to the current marketing landing", async ({ page }) => {
    await mockSupabase(page);

    for (const path of ["/settings#onboarding", "/picks", "/taste"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
      await expect(
        page.getByRole("heading", { name: "Never waste your time on the wrong game again." }),
      ).toBeVisible();
      await expect(page.getByText("Set up your taste first")).toHaveCount(0);
    }
  });

  test("returning cookie without a profile never renders the Hades legacy intro", async ({
    page,
  }) => {
    await page
      .context()
      .addCookies([{ name: "pf_returning", value: "1", url: "http://localhost:3107/" }]);
    await mockSupabase(page);
    await gotoApp(page, "/");

    await expect(
      page.getByRole("heading", { name: "Never waste your time on the wrong game again." }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Hades")).toHaveCount(0);
    await expect(page.getByText("Your next game")).toHaveCount(0);
  });
});

test("anonymous local profile can complete setup and save by device id", async ({ page }) => {
  const savedProfiles = await mockSupabase(page);

  await gotoApp(page, "/");

  await advanceFromPlatformStep(page);

  await expect(page.getByRole("heading", { name: "Pick three games you loved" })).toBeVisible();
  await selectLovedGame(page, "Chrono", /Chrono Trigger/);
  await selectLovedGame(page, "Metroid", /Metroid Prime/);
  await selectLovedGame(page, "Tears", /Tears of the Kingdom/);
  await page.getByRole("button", { name: /Continue/ }).click();

  await expect(
    page.getByRole("heading", { name: "Pick one game that wasn't for you" }),
  ).toBeVisible();
  await selectMissedGame(page, "Resident Evil", /Resident Evil 4/);
  await expect(page.getByRole("button", { name: "Find Play Next" })).toBeEnabled();
  await page.getByRole("button", { name: "Find Play Next" }).click();

  await expect(page.getByText("Play this next")).toBeVisible();
  await expect
    .poll(() =>
      Boolean(
        [...savedProfiles].reverse().find((profile) => {
          return (profile as { onboarding?: { onboardingCompletedAt?: string } }).onboarding
            ?.onboardingCompletedAt;
        }),
      ),
    )
    .toBe(true);
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

test("onboarding can be fully skipped and still reaches a recommendation", async ({ page }) => {
  const savedProfiles = await mockSupabase(page);

  await gotoApp(page, "/");
  await openCalibration(page);

  await expect(page.getByRole("heading", { name: "Where do you play?" })).toBeVisible({
    timeout: 15_000,
  });
  // Platforms start pre-selected with every known platform (see withDefaultPlatforms in
  // playfit-context.tsx), so this step's Continue button is no longer a "Skip" — the user
  // still advances without touching anything, they just aren't starting from zero.
  const platformsContinue = page.getByRole("button", { name: /Continue/ });
  await expect(platformsContinue).toHaveText("Continue");
  await platformsContinue.click();

  await expect(page.getByRole("heading", { name: "Pick three games you loved" })).toBeVisible();
  const lovedContinue = page.getByRole("button", { name: /Continue/ });
  await expect(lovedContinue).toHaveText(/Skip & Continue/);
  await lovedContinue.click();

  await expect(
    page.getByRole("heading", { name: "Pick one game that wasn't for you" }),
  ).toBeVisible();
  const finalizeButton = page.getByRole("button", { name: "Skip & Find Play Next" });
  await expect(finalizeButton).toBeEnabled();
  await finalizeButton.click();

  await expect(page.getByText("Play this next")).toBeVisible();
  await expect(page.getByRole("heading", { name: "No games to recommend yet" })).toHaveCount(0);

  await expect
    .poll(() =>
      Boolean(
        [...savedProfiles].reverse().find((profile) => {
          return (profile as { onboarding?: { onboardingCompletedAt?: string } }).onboarding
            ?.onboardingCompletedAt;
        }),
      ),
    )
    .toBe(true);
});

test("play route loads locally without mandatory sign in", async ({ page }) => {
  await mockSupabase(page);

  await gotoApp(page, "/");

  await openCalibration(page);
  await expect(page.getByRole("heading", { name: "Where do you play?" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: "Continue locally" })).toHaveCount(0);
});

test("play dossier direct link redirects incomplete users to the marketing landing", async ({
  page,
}) => {
  await mockSupabase(page);

  await gotoApp(page, "/game/metroid_prime");

  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: "Never waste your time on the wrong game again." }),
  ).toBeVisible();
  await expect(page.getByText("Set up your taste first")).toHaveCount(0);
  await expect(page.getByText("Hades")).toHaveCount(0);
});

test("picks route redirects new users to the marketing landing", async ({ page }) => {
  await mockSupabase(page);

  await gotoApp(page, "/picks");

  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: "Never waste your time on the wrong game again." }),
  ).toBeVisible();
});

test("taste route explains onboarding signals and lets users remove one", async ({ page }) => {
  await mockSupabase(page);

  await gotoApp(page, "/");
  await advanceFromPlatformStep(page);
  await selectLovedGame(page, "Chrono", /Chrono Trigger/);
  await selectLovedGame(page, "Metroid", /Metroid Prime/);
  await selectLovedGame(page, "Tears", /Tears of the Kingdom/);
  await page.getByRole("button", { name: /Continue/ }).click();
  await selectMissedGame(page, "Resident Evil", /Resident Evil 4/);
  await page.getByRole("button", { name: "Find Play Next" }).click();

  await Promise.all([
    page.waitForURL(/\/taste$/, { timeout: 15_000, waitUntil: "domcontentloaded" }),
    page.getByRole("link", { name: /Taste/ }).filter({ visible: true }).first().click(),
  ]);

  await expect(page).toHaveURL(/\/taste$/);
  await expect(page.getByText("Profile Summary").filter({ visible: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Preferences").filter({ visible: true }).first()).toBeVisible();

  const decisionsTabBtn = page.getByRole("button", { name: /Decisions/ });
  if ((await decisionsTabBtn.count()) > 0 && (await decisionsTabBtn.isVisible())) {
    await decisionsTabBtn.click();
  }

  await Promise.all([
    page.waitForURL(/\/game\//, { timeout: 15_000, waitUntil: "domcontentloaded" }),
    page.locator('a[href^="/game/"]').filter({ visible: true }).first().click(),
  ]);
  await expect(page.getByRole("heading", { name: "Chrono Trigger" }).first()).toBeVisible({
    timeout: 15_000,
  });

  await Promise.all([
    page.waitForURL(/\/taste$/, { timeout: 15_000, waitUntil: "domcontentloaded" }),
    page.getByRole("button", { name: "Back" }).first().click(),
  ]);
  await expect(page.getByText("Profile Summary").filter({ visible: true }).first()).toBeVisible({
    timeout: 15_000,
  });
});

test("playfit picks saves a recommendation and removes it from queue", async ({ page }) => {
  const savedProfiles = await mockSupabase(page);
  let todayRecommendationRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/recommendations/today") {
      todayRecommendationRequests += 1;
    }
  });

  await gotoApp(page, "/");
  await advanceFromPlatformStep(page);
  await selectLovedGame(page, "Chrono", /Chrono Trigger/);
  await selectLovedGame(page, "Metroid", /Metroid Prime/);
  await selectLovedGame(page, "Tears", /Tears of the Kingdom/);
  await page.getByRole("button", { name: /Continue/ }).click();
  await selectMissedGame(page, "Resident Evil", /Resident Evil 4/);
  await page.getByRole("button", { name: "Find Play Next" }).click();

  await expect(page.getByRole("heading", { name: "Final Fantasy VI" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save to Picks" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Maybe later" })).toHaveCount(0);
  const requestsBeforePick = todayRecommendationRequests;
  await page.getByRole("button", { name: "Save to Picks" }).first().click();

  await expect(page.getByRole("heading", { name: "Hollow Knight: Silksong" })).toBeVisible();
  await expect
    .poll(() =>
      savedProfiles.some((profile) => {
        const gameState = (
          profile as {
            gameStates?: Record<string, { inPlayfitPicks?: boolean; status?: string }>;
          }
        ).gameStates?.final_fantasy_vi;
        return gameState?.inPlayfitPicks === true;
      }),
    )
    .toBe(true);
  await expect
    .poll(() => todayRecommendationRequests - requestsBeforePick, { timeout: 5000 })
    .toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(250);
  expect(todayRecommendationRequests - requestsBeforePick).toBeLessThanOrEqual(10);

  await Promise.all([
    page.waitForURL(/\/picks$/, { timeout: 15_000, waitUntil: "domcontentloaded" }),
    page.getByRole("link", { name: /Picks/ }).click(),
  ]);

  await expect(page.getByRole("heading", { name: "Final Fantasy VI" }).first()).toBeVisible({
    timeout: 15_000,
  });
  const managePickBtn = page.getByRole("button", { name: "Manage pick" });
  if ((await managePickBtn.count()) > 0 && (await managePickBtn.isVisible())) {
    await managePickBtn.click();
  }
  await page.getByRole("button", { name: /Remove recommendation|Remove Pick/ }).click();

  await expect(page.getByText("Removed from Playfit Picks.")).toBeVisible();
});

test("play next feedback excludes a bad fit", async ({ page }) => {
  const savedProfiles = await mockSupabase(page);

  await gotoApp(page, "/");
  await advanceFromPlatformStep(page);
  await selectLovedGame(page, "Chrono", /Chrono Trigger/);
  await selectLovedGame(page, "Metroid", /Metroid Prime/);
  await selectLovedGame(page, "Tears", /Tears of the Kingdom/);
  await page.getByRole("button", { name: /Continue/ }).click();
  await selectMissedGame(page, "Resident Evil", /Resident Evil 4/);
  await expect(page.getByRole("button", { name: "Find Play Next" })).toBeEnabled();
  await page.getByRole("button", { name: "Find Play Next" }).click();

  await expect(page.getByText("Play this next")).toBeVisible();
  await page.getByRole("button", { name: "No, skip this" }).first().click();

  await expect(page.getByText("What got in the way?")).toHaveCount(0);
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

  await gotoApp(page, "/");
  await advanceFromPlatformStep(page);
  await selectLovedGame(page, "Chrono", /Chrono Trigger/);
  await selectLovedGame(page, "Metroid", /Metroid Prime/);
  await selectLovedGame(page, "Tears", /Tears of the Kingdom/);
  await page.getByRole("button", { name: /Continue/ }).click();
  await selectMissedGame(page, "Resident Evil", /Resident Evil 4/);
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
    page.waitForURL(/\/taste$/, { timeout: 15_000, waitUntil: "domcontentloaded" }),
    page.getByRole("link", { name: /Taste/ }).filter({ visible: true }).first().click(),
  ]);
  await expect(page.getByText("Profile Summary").filter({ visible: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  const decisionsTabBtn = page.getByRole("button", { name: /Decisions/ });
  if ((await decisionsTabBtn.count()) > 0 && (await decisionsTabBtn.isVisible())) {
    await decisionsTabBtn.click();
  }
  await expect(page.getByText("Final Fantasy VI").filter({ visible: true }).first()).toBeVisible({
    timeout: 15_000,
  });
});

test("already played dropped marks abandoned and stays out after reload", async ({ page }) => {
  const savedProfiles = await mockSupabase(page);

  await gotoApp(page, "/");
  await advanceFromPlatformStep(page);
  await selectLovedGame(page, "Chrono", /Chrono Trigger/);
  await selectLovedGame(page, "Metroid", /Metroid Prime/);
  await selectLovedGame(page, "Tears", /Tears of the Kingdom/);
  await page.getByRole("button", { name: /Continue/ }).click();
  await selectMissedGame(page, "Resident Evil", /Resident Evil 4/);
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

  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Hollow Knight: Silksong" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Final Fantasy VI" })).toHaveCount(0);

  await Promise.all([
    page.waitForURL(/\/taste$/, { timeout: 15_000, waitUntil: "domcontentloaded" }),
    page.getByRole("link", { name: /Taste/ }).filter({ visible: true }).first().click(),
  ]);
  await expect(page.getByText("Profile Summary").filter({ visible: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  const decisionsTabBtn = page.getByRole("button", { name: /Decisions/ });
  if ((await decisionsTabBtn.count()) > 0 && (await decisionsTabBtn.isVisible())) {
    await decisionsTabBtn.click();
  }
  await expect(page.getByText("Final Fantasy VI").filter({ visible: true }).first()).toBeVisible({
    timeout: 15_000,
  });
});
