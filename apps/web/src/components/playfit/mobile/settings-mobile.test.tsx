import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsMobile } from "./settings-mobile";

vi.mock("../platforms-tab-content", () => ({
  PlatformsTabContent: () => <div>platforms-content</div>,
}));

function renderMenu(authUser: { id: string; email: string; isAnonymous: boolean } | null) {
  return render(
    <SettingsMobile
      subView="menu"
      setSubView={vi.fn()}
      renderThemeCard={() => <div>theme-content</div>}
      renderAccountCard={() => <div>account-content</div>}
      renderPrivacyCard={() => <div>privacy-content</div>}
      authUser={authUser}
      theme="dark"
      platformsCount={3}
      setUseLocalProfile={vi.fn()}
    />,
  );
}

describe("SettingsMobile menu", () => {
  afterEach(cleanup);

  it("orders the menu by importance with data and privacy last", () => {
    renderMenu({ id: "user-1", email: "user@example.com", isAnonymous: false });

    const labels = screen.getAllByRole("button").map((button) => button.textContent ?? "");

    expect(labels).toHaveLength(4);
    expect(labels[0]).toContain("Your Platforms");
    expect(labels[1]).toContain("Your Account");
    expect(labels[2]).toContain("App Appearance");
    expect(labels[3]).toContain("Data & Privacy");
  });

  it("keeps the sign-in prompt in the account position for signed-out users", () => {
    renderMenu(null);

    const labels = screen.getAllByRole("button").map((button) => button.textContent ?? "");

    expect(labels[0]).toContain("Your Platforms");
    expect(labels[1]).toContain("Sign In / Sync Profile");
    expect(labels[2]).toContain("App Appearance");
    expect(labels[3]).toContain("Data & Privacy");
  });
});
