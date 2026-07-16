import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = [
  { name: "home", path: "/" },
  { name: "search", path: "/search" },
  { name: "how it works", path: "/how-it-works" },
];

for (const target of pages) {
  test(`${target.name} has no automated accessibility violations`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await page.goto(target.path, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(100);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.addStyleTag({
      content:
        '[style*="opacity"] { opacity: 1 !important; transform: none !important; } *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }',
    });
    await expect
      .poll(() =>
        page.evaluate(() => ({
          background: getComputedStyle(document.body).backgroundColor,
          foreground: getComputedStyle(document.documentElement).getPropertyValue("--foreground"),
        })),
      )
      .toEqual({ background: "rgb(248, 250, 252)", foreground: "#0f172a" });

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}
