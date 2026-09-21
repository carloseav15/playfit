import type { ProductTasteModel } from "@playfit/core/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseTasteSection, type TasteSection } from "../taste/taste-sections";
import { TasteDesktop } from "./taste-desktop";

const push = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

vi.mock("../taste-components", () => ({
  TasteMap: ({
    onSelectTrait,
  }: {
    onSelectTrait: (trait: { id: string; label: string }) => void;
  }) => (
    <button type="button" onClick={() => onSelectTrait({ id: "jrpg", label: "JRPG" })}>
      dna-content
    </button>
  ),
  TasteHistory: () => <div>activity-content</div>,
}));

vi.mock("../taste-map-visualizer", () => ({
  TasteMapVisualizer: () => <div>map-content</div>,
}));

const model = {
  mapTraits: [{ id: "jrpg", label: "JRPG", strength: 2 }],
  evidenceCount: 5,
  positiveCount: 3,
  negativeCount: 1,
  confidenceLabel: "Early signal",
} as unknown as ProductTasteModel;

function renderSidebar(section: TasteSection, onSelectTrait = vi.fn()) {
  render(
    <TasteDesktop
      section={section}
      model={model}
      historyAndActivityEntries={[]}
      gamesById={new Map()}
      gameStates={{}}
      recs={[]}
      changingId={null}
      setChangingId={vi.fn()}
      applyDecisionFeedback={vi.fn()}
      setPlayfitPick={vi.fn()}
      removeTasteSignal={vi.fn()}
      traitFilter={null}
      onSelectTrait={onSelectTrait}
      onClearTraitFilter={vi.fn()}
    />,
  );
  return onSelectTrait;
}

describe("TasteDesktop", () => {
  afterEach(() => {
    cleanup();
    push.mockClear();
  });

  it.each([
    ["dna", "dna-content"],
    ["map", "map-content"],
    ["activity", "activity-content"],
  ] as const)("shows only the %s section", (section, content) => {
    renderSidebar(section);

    expect(screen.getByText(content)).toBeTruthy();
    for (const other of ["dna-content", "map-content", "activity-content"]) {
      if (other !== content) expect(screen.queryByText(other)).toBeNull();
    }
  });

  it("orders the menu with Taste DNA first and marks the active section", () => {
    renderSidebar("map");
    const nav = screen.getByRole("navigation", { name: "Taste sections" });
    const links = Array.from(nav.querySelectorAll("a"));

    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/taste?section=dna",
      "/taste?section=map",
      "/taste?section=activity",
    ]);
    expect(links[0].textContent).toContain("Taste DNA");
    expect(links[1].textContent).toContain("Visual map");
    expect(links[2].textContent).toContain("Activity");
    expect(links.map((link) => link.getAttribute("aria-current"))).toEqual([null, "page", null]);
    expect(screen.getByText("Based on 5 preferences")).toBeTruthy();
  });

  it("summarizes each section under its name", () => {
    renderSidebar("dna");

    expect(screen.getByText("1 trait")).toBeTruthy();
    expect(screen.getByText("Explore your affinity map")).toBeTruthy();
    expect(screen.getByText("0 entries")).toBeTruthy();
  });

  it("jumps to Activity when a trait is selected in Taste DNA", () => {
    const onSelectTrait = renderSidebar("dna");

    fireEvent.click(screen.getByText("dna-content"));

    expect(onSelectTrait).toHaveBeenCalledWith({ id: "jrpg", label: "JRPG" });
    expect(push).toHaveBeenCalledWith("/taste?section=activity", { scroll: false });
  });
});

describe("parseTasteSection", () => {
  it("falls back to dna for unknown or missing sections", () => {
    expect(parseTasteSection(undefined)).toBe("dna");
    expect(parseTasteSection("nope")).toBe("dna");
    expect(parseTasteSection("activity")).toBe("activity");
  });
});
