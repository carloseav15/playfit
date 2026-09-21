import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { parseSettingsSection, SettingsDesktop, type SettingsSection } from "./settings-desktop";

vi.mock("../platforms-tab-content", () => ({
  PlatformsTabContent: () => <div>platforms-content</div>,
}));

function render(section: SettingsSection, accountLabel = "Account") {
  return renderToStaticMarkup(
    <SettingsDesktop
      section={section}
      accountLabel={accountLabel}
      summaries={{
        appearance: "Theme: Dark",
        platforms: "3 systems selected",
        account: "user@example.com",
        privacy: "Reset or delete your data",
      }}
      renderThemeCard={() => <div>theme-content</div>}
      renderAccountCard={() => <div>account-content</div>}
      renderPrivacyCard={() => <div>privacy-content</div>}
    />,
  );
}

describe("SettingsDesktop", () => {
  it.each([
    ["appearance", "theme-content"],
    ["platforms", "platforms-content"],
    ["account", "account-content"],
    ["privacy", "privacy-content"],
  ] as const)("shows only the %s section", (section, content) => {
    const html = render(section);

    expect(html).toContain(content);
    for (const other of [
      "theme-content",
      "platforms-content",
      "account-content",
      "privacy-content",
    ]) {
      if (other !== content) expect(html).not.toContain(other);
    }
  });

  it("marks the active section as the current page and links every section", () => {
    const html = render("account");

    expect(html).toContain('aria-label="Settings sections"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page"[^>]*>.*Account/s);
    for (const section of ["appearance", "platforms", "account", "privacy"]) {
      expect(html).toContain(`/settings?section=${section}`);
    }
  });

  it("shows a one-line summary under each section name", () => {
    const html = render("platforms");

    for (const summary of [
      "Theme: Dark",
      "3 systems selected",
      "user@example.com",
      "Reset or delete your data",
    ]) {
      expect(html).toContain(summary);
    }
  });

  it("orders the menu by importance with data and privacy last", () => {
    const html = render("platforms");
    const positions = ["Your platforms", "Account", "Appearance", "Data &amp; privacy"].map(
      (label) => html.indexOf(label),
    );

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("labels the account entry for signed-out users", () => {
    expect(render("appearance", "Cloud sync")).toContain("Cloud sync");
  });
});

describe("parseSettingsSection", () => {
  it("falls back to platforms for unknown or missing sections", () => {
    expect(parseSettingsSection(undefined)).toBe("platforms");
    expect(parseSettingsSection("nope")).toBe("platforms");
    expect(parseSettingsSection("privacy")).toBe("privacy");
  });
});
