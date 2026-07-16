import { createInitialState } from "@playfit/core/store";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  usePlayfitState: vi.fn(),
}));

vi.mock("../playfit/playfit-context", () => ({
  usePlayfitState: mocks.usePlayfitState,
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

  it("renders no fallback screen before redirecting users without a profile", async () => {
    mocks.usePlayfitState.mockReturnValue({
      state: createInitialState(),
      applyDecisionFeedback: vi.fn(),
      setPlayfitPick: vi.fn(),
    });
    const { PicksShell } = await loadPicksShell();

    const html = renderToStaticMarkup(<PicksShell />);

    expect(html).toBe("");
  });
});
