import { describe, expect, it } from "vitest";
import { nextPlatformSelectionForPreset, withPlatformSelectionGuard } from "./onboarding-helpers";

describe("withPlatformSelectionGuard", () => {
  it("allows shrinking a selection as long as at least one platform remains", () => {
    const current = [{ platformId: "ps5" }, { platformId: "pc" }];
    const next = [{ platformId: "ps5" }];

    expect(withPlatformSelectionGuard(current, next)).toBe(next);
  });

  it("blocks a change that would drop the selection to 0", () => {
    const current = [{ platformId: "ps5" }];
    const next: Array<{ platformId: string }> = [];

    expect(withPlatformSelectionGuard(current, next)).toBe(current);
  });

  it("allows staying at 0 when the selection was already empty", () => {
    const current: Array<{ platformId: string }> = [];
    const next: Array<{ platformId: string }> = [];

    expect(withPlatformSelectionGuard(current, next)).toBe(next);
  });

  it("allows growing a selection", () => {
    const current = [{ platformId: "ps5" }];
    const next = [{ platformId: "ps5" }, { platformId: "pc" }];

    expect(withPlatformSelectionGuard(current, next)).toBe(next);
  });
});

type Entry = { platformId: string; status: "available" };

function entry(platformId: string): Entry {
  return { platformId, status: "available" };
}

function ids(entries: Entry[]): string[] {
  return entries.map((e) => e.platformId);
}

describe("nextPlatformSelectionForPreset (P1 #5)", () => {
  const ALL_SEVEN = ["switch_2", "switch_1", "ps5", "ps4", "xbox_series_xs", "pc", "snes"];
  const freshDefault = ALL_SEVEN.map(entry);

  it("narrows to exactly the clicked group on a fresh, untouched all-platforms default", () => {
    // Reproduces the exact reported bug: a fresh profile starts with every
    // known platform selected (withDefaultPlatforms), so a first-time user
    // who owns only a Switch and clicks "Nintendo" must end up with only
    // Nintendo platforms selected, not with every OTHER platform still on.
    const result = nextPlatformSelectionForPreset(
      freshDefault,
      ["switch_2", "switch_1", "snes"],
      ALL_SEVEN.length,
      entry,
    );

    expect(ids(result).sort()).toEqual(["snes", "switch_1", "switch_2"]);
  });

  it("does not silently fall back to including platforms the user never selected", () => {
    const result = nextPlatformSelectionForPreset(
      freshDefault,
      ["ps5", "ps4"],
      ALL_SEVEN.length,
      entry,
    );

    expect(ids(result).sort()).toEqual(["ps4", "ps5"]);
    expect(ids(result)).not.toContain("switch_2");
    expect(ids(result)).not.toContain("xbox_series_xs");
  });

  it("behaves as a normal additive toggle once the selection has already been customized", () => {
    const narrowed = [entry("switch_2"), entry("switch_1"), entry("snes")];

    const withPlaystationAdded = nextPlatformSelectionForPreset(
      narrowed,
      ["ps5", "ps4"],
      ALL_SEVEN.length,
      entry,
    );

    expect(ids(withPlaystationAdded).sort()).toEqual([
      "ps4",
      "ps5",
      "snes",
      "switch_1",
      "switch_2",
    ]);
  });

  it("toggles a preset back off once already selected in a customized (non-default) state", () => {
    const nintendoAndPlaystation = [
      entry("switch_2"),
      entry("switch_1"),
      entry("snes"),
      entry("ps5"),
      entry("ps4"),
    ];

    const result = nextPlatformSelectionForPreset(
      nintendoAndPlaystation,
      ["switch_2", "switch_1", "snes"],
      ALL_SEVEN.length,
      entry,
    );

    expect(ids(result).sort()).toEqual(["ps4", "ps5"]);
  });

  it("never bottoms out at 0 even when removing the last selected preset", () => {
    const playstationOnly = [entry("ps5"), entry("ps4")];

    const result = nextPlatformSelectionForPreset(
      playstationOnly,
      ["ps5", "ps4"],
      ALL_SEVEN.length,
      entry,
    );

    // The zero-selection guard blocks the change entirely -- same reference back.
    expect(result).toBe(playstationOnly);
    expect(ids(result).sort()).toEqual(["ps4", "ps5"]);
  });

  it("reconstructs the full original set when every preset is selected one by one", () => {
    let current = freshDefault;
    current = nextPlatformSelectionForPreset(
      current,
      ["switch_2", "switch_1", "snes"],
      ALL_SEVEN.length,
      entry,
    );
    current = nextPlatformSelectionForPreset(current, ["ps5", "ps4"], ALL_SEVEN.length, entry);
    current = nextPlatformSelectionForPreset(current, ["xbox_series_xs"], ALL_SEVEN.length, entry);
    current = nextPlatformSelectionForPreset(current, ["pc"], ALL_SEVEN.length, entry);

    expect(ids(current).sort()).toEqual([...ALL_SEVEN].sort());
  });

  it("is a no-op when the preset matches no platforms", () => {
    const result = nextPlatformSelectionForPreset(freshDefault, [], ALL_SEVEN.length, entry);
    expect(result).toBe(freshDefault);
  });
});
