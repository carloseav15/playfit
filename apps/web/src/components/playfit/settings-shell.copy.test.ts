import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "settings-shell.tsx"), "utf-8");

describe("SettingsShell delete-account copy", () => {
  it("does not overpromise deletion of sign-in credentials the backend does not delete", () => {
    expect(source).not.toContain("sign-in\n                  credentials from our servers");
    expect(source).not.toMatch(/sign-in\s+credentials from our servers/);
  });

  it("matches the scope actually implemented by DELETE /api/profile (profile-only deletion)", () => {
    expect(source).toContain("Delete Cloud Profile");
    expect(source).toContain("Your account sign-in credentials are not");
  });
});
