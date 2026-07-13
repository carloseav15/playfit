import { expect, type Page, test } from "@playwright/test";

test.setTimeout(45_000);

// Minimal, self-contained fixtures for /search -- deliberately not reusing playfit.spec.ts's
// mockSupabase() helper, since that's built around the onboarding/recommendation flows and
// would pull in ~15 unrelated route mocks. /search is a session-free browsing surface, a
// fundamentally different concern (zero-phantom-session-on-load) worth its own spec.
const searchFixtureGames = [
  {
    gameId: "chrono_trigger",
    title: "Chrono Trigger",
    aliases: [],
    series: "",
    source: "catalog",
    primaryGenre: "jrpg",
    genreId: "jrpg",
    tags: [],
    notes: "",
    coverPath: "",
    releaseYear: "1995",
    availablePlatformIds: ["snes"],
    availablePlatformNames: ["SNES"],
    releaseState: "released",
  },
  {
    gameId: "zelda_tears",
    title: "The Legend of Zelda: Tears of the Kingdom",
    aliases: [],
    series: "",
    source: "catalog",
    primaryGenre: "adventure",
    genreId: "adventure",
    tags: [],
    notes: "",
    coverPath: "",
    releaseYear: "2023",
    availablePlatformIds: ["switch_1"],
    availablePlatformNames: ["Nintendo Switch"],
    releaseState: "released",
  },
];

async function mockAuthAndSearch(page: Page) {
  let signupCalls = 0;

  await page.route("**/auth/v1/signup", async (route) => {
    signupCalls += 1;
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
          id: "00000000-0000-4000-8000-000000000002",
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

  await page.route("**/api/games?**", async (route) => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get("q")?.toLowerCase() ?? "";
    const platform = url.searchParams.get("platform");
    const genre = url.searchParams.get("genre");

    let games = searchFixtureGames.filter((g) =>
      query ? g.title.toLowerCase().includes(query) : true,
    );
    if (platform) {
      const ids = platform.split(",");
      games = games.filter((g) => g.availablePlatformIds.some((id) => ids.includes(id)));
    }
    if (genre) {
      games = games.filter((g) => g.genreId === genre);
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ games, total: games.length, page: 1, pageSize: 24 }),
    });
  });

  return () => signupCalls;
}

test("search page loads and browses without creating a session", async ({ page }) => {
  const getSignupCalls = await mockAuthAndSearch(page);

  await page.goto("/search", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Search the catalog" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Chrono Trigger")).toBeVisible();
  await expect(page.getByText("The Legend of Zelda: Tears of the Kingdom")).toBeVisible();

  expect(getSignupCalls()).toBe(0);
});

test("search uses the shared desktop navigation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Desktop navigation is hidden on mobile.");

  await mockAuthAndSearch(page);
  await page.goto("/search", { waitUntil: "domcontentloaded" });

  const searchLink = page.getByRole("link", { name: "Search", exact: true });
  await expect(searchLink).toBeVisible({ timeout: 15_000 });
  await expect(searchLink).toHaveAttribute("aria-current", "page");
});

test("search filters by query without creating a session", async ({ page }) => {
  const getSignupCalls = await mockAuthAndSearch(page);

  await page.goto("/search", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Chrono Trigger")).toBeVisible({ timeout: 15_000 });

  await page.getByPlaceholder("Search by title...").fill("zelda");
  await expect(page.getByText("The Legend of Zelda: Tears of the Kingdom")).toBeVisible();
  await expect(page.getByText("Chrono Trigger")).toHaveCount(0);

  expect(getSignupCalls()).toBe(0);
});

test("clicking a search result navigates to the game page, which is where the session starts", async ({
  page,
}) => {
  const getSignupCalls = await mockAuthAndSearch(page);

  await page.goto("/search", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Chrono Trigger")).toBeVisible({ timeout: 15_000 });
  expect(getSignupCalls()).toBe(0);

  await page.getByText("Chrono Trigger").click();

  await expect(page).toHaveURL(/\/game\/chrono_trigger/, { timeout: 15_000 });
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/search");
  await expect.poll(() => getSignupCalls(), { timeout: 15_000 }).toBeGreaterThan(0);
});
