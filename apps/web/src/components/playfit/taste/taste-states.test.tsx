import { createInitialState } from "@playfit/core/store";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  usePlayfitState: vi.fn(),
}));

vi.mock("../playfit-context", () => ({
  usePlayfitState: mocks.usePlayfitState,
}));

vi.mock("../../cover-art", () => ({
  CoverArt: () => "Cover",
}));

async function loadComponents() {
  vi.resetModules();
  const [{ TasteHistory }, { TasteMapVisualizer }] = await Promise.all([
    import("./taste-history"),
    import("../taste-map-visualizer"),
  ]);
  return { TasteHistory, TasteMapVisualizer };
}

describe("Taste UI empty states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.usePlayfitState.mockReturnValue({
      state: createInitialState(),
      getSeedGame: vi.fn(() => null),
    });
  });

  it("renders an empty affinity map without recommendation cards", async () => {
    const { TasteMapVisualizer } = await loadComponents();

    const html = renderToStaticMarkup(<TasteMapVisualizer gamesById={new Map()} gameStates={{}} />);

    expect(html).toContain("Liked / Playing (0)");
    expect(html).toContain("Disliked / Dropped (0)");
    expect(html).toContain("Pending Picks (0)");
    expect(html).not.toContain("Previous preference card");
  });

  it("renders the existing empty history message", async () => {
    const { TasteHistory } = await loadComponents();

    const html = renderToStaticMarkup(
      <TasteHistory
        entries={[]}
        changingId={null}
        onToggleChange={vi.fn()}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(html).toContain("No entries in this view.");
  });
});
