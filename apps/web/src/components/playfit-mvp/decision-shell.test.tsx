import { createInitialState } from "@playfit/core/store";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ChildrenProps = { children?: React.ReactNode };

const mocks = vi.hoisted(() => ({
  usePlayfit: vi.fn(),
}));

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children }: ChildrenProps) => children,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: ChildrenProps) => children,
  CardDescription: ({ children }: ChildrenProps) => children,
  CardHeader: ({ children }: ChildrenProps) => children,
  CardTitle: ({ children }: ChildrenProps) => children,
}));

vi.mock("@/components/ui/container", () => ({
  Container: ({ children }: ChildrenProps) => children,
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => null,
}));

vi.mock("@/lib/game-cache", () => ({
  addGamesToCache: vi.fn(),
}));

vi.mock("./play-next-card", () => ({
  PlayNextCard: () => null,
}));

vi.mock("../playfit/playfit-context", () => ({
  usePlayfit: mocks.usePlayfit,
}));

vi.mock("../playfit/onboarding-section", () => ({
  OnboardingSection: () => "Tune your taste",
}));

vi.mock("../playfit/status-toast", () => ({
  StatusToast: () => null,
}));

async function loadDecisionShell() {
  vi.resetModules();
  return import("./decision-shell");
}

describe("DecisionShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders taste onboarding instead of a dead-end state for new users", async () => {
    mocks.usePlayfit.mockReturnValue({
      state: createInitialState(),
      applyDecisionFeedback: vi.fn(),
      setStatusMessage: vi.fn(),
    });
    const { DecisionShell } = await loadDecisionShell();

    const html = renderToStaticMarkup(<DecisionShell />);

    expect(html).toContain("Tune your taste");
    expect(html).not.toContain("Not ready yet");
  });
});
