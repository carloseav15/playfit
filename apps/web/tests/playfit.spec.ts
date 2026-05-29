import { expect, test } from "@playwright/test";

test("landing and case study render with portfolio stack signals", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Find games that actually fit you." }),
  ).toBeVisible();
  await expect(page.getByText("Next.js, React, TypeScript, Tailwind, shadcn/ui")).toBeVisible();
  await expect(
    page.getByAltText("Playfit dashboard with current run and recommendation cards"),
  ).toBeVisible();

  await page.getByRole("link", { name: "Read case study" }).click();
  await expect(
    page.getByRole("heading", {
      name: "A recommendation product for personal fit, not public hype.",
    }),
  ).toBeVisible();
});

test("app onboarding can reach the anchor step", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "What are you gaming on?" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel("Xbox Series X|S").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Pick three anchor games" })).toBeVisible();
});
