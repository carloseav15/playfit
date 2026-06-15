import { createInitialState } from "@playfit/core/store";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  usePlayfit: vi.fn(),
}));

vi.mock("../playfit/playfit-context", () => ({
  usePlayfit: mocks.usePlayfit,
}));

vi.mock("../playfit/status-toast", () => ({
  StatusToast: () => null,
}));

async function loadPicksShell() {
  vi.resetModules();
  return import("./picks-shell");
}

describe("PicksShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks users to tune taste before showing picks", async () => {
    mocks.usePlayfit.mockReturnValue({
      state: createInitialState(),
      applyDecisionFeedback: vi.fn(),
      setPlayfitPick: vi.fn(),
      startPlayfitPick: vi.fn(),
    });
    const { PicksShell } = await loadPicksShell();

    const html = renderToStaticMarkup(<PicksShell />);

    expect(html).toContain("Tune your taste first");
    expect(html).toContain("Start Play Next");
  });
});
