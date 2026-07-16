import { createInitialState } from "@playfit/core/store";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ChildrenProps = { children?: React.ReactNode };

const mocks = vi.hoisted(() => ({
  deleteAccount: vi.fn(),
  linkGoogleAccount: vi.fn(),
  resetTasteProfile: vi.fn(),
  routerPush: vi.fn(),
  setStatusMessage: vi.fn(),
  setUseLocalProfile: vi.fn(),
  signOut: vi.fn(),
  setTheme: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: mocks.setTheme }),
}));

vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }: ChildrenProps & Record<string, unknown>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("./mobile/settings-mobile", () => ({
  SettingsMobile: ({
    renderAccountCard,
    renderPrivacyCard,
  }: {
    renderAccountCard: () => React.ReactNode;
    renderPrivacyCard: () => React.ReactNode;
  }) => (
    <div>
      {renderAccountCard()}
      {renderPrivacyCard()}
    </div>
  ),
}));

vi.mock("./desktop/settings-desktop", () => ({
  SettingsDesktop: () => null,
}));

vi.mock("../playfit/header-context", () => ({
  useHeader: vi.fn(),
}));

vi.mock("../playfit/playfit-context", () => ({
  usePlayfitState: () => ({
    state: {
      ...createInitialState(),
      user: {
        ...createInitialState().user,
        onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
        profile: { ratedCount: 3 },
      },
    },
    authUser: { id: "user-1", email: "user@example.com", isAnonymous: false },
    deleteAccount: mocks.deleteAccount,
    linkGoogleAccount: mocks.linkGoogleAccount,
    resetTasteProfile: mocks.resetTasteProfile,
    setUseLocalProfile: mocks.setUseLocalProfile,
    signOut: mocks.signOut,
  }),
  usePlayfitUi: () => ({ setStatusMessage: mocks.setStatusMessage }),
}));

vi.mock("../playfit/status-toast", () => ({
  StatusToast: () => null,
}));

async function loadSettingsShell() {
  vi.resetModules();
  return import("./settings-shell");
}

describe("SettingsShell actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetTasteProfile.mockResolvedValue(undefined);
    mocks.deleteAccount.mockResolvedValue(undefined);
  });

  it("resets the profile only after confirmation and returns to the landing", async () => {
    const user = userEvent.setup();
    const { SettingsShell } = await loadSettingsShell();
    render(<SettingsShell />);

    await user.click(screen.getByRole("button", { name: "Reset Profile" }));
    expect(mocks.resetTasteProfile).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Confirm Reset" }));

    await waitFor(() => expect(mocks.resetTasteProfile).toHaveBeenCalledOnce());
    expect(mocks.routerPush).toHaveBeenCalledWith("/");
  });

  it("keeps the profile intact and reports a reset failure", async () => {
    mocks.resetTasteProfile.mockRejectedValue(new Error("reset failed"));
    const user = userEvent.setup();
    const { SettingsShell } = await loadSettingsShell();
    render(<SettingsShell />);

    await user.click(screen.getByRole("button", { name: "Reset Profile" }));
    await user.click(screen.getByRole("button", { name: "Confirm Reset" }));

    await waitFor(() =>
      expect(mocks.setStatusMessage).toHaveBeenCalledWith(
        "Could not reset your taste profile. Your data is unchanged — try again.",
      ),
    );
    expect(mocks.routerPush).not.toHaveBeenCalled();
  });

  it("deletes the cloud profile only after confirmation", async () => {
    const user = userEvent.setup();
    const { SettingsShell } = await loadSettingsShell();
    render(<SettingsShell />);

    await user.click(screen.getByRole("button", { name: "Delete Cloud Profile" }));
    expect(mocks.deleteAccount).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Confirm Delete" }));

    await waitFor(() => expect(mocks.deleteAccount).toHaveBeenCalledOnce());
    expect(mocks.routerPush).toHaveBeenCalledWith("/");
  });
});
