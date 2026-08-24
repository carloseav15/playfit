import type { ProductPlatformOption } from "@playfit/core/types";
import { Gamepad2, Laptop, Tv } from "lucide-react";

export type SearchSlot = "anchor" | "dislike";

export const preferredPlatformFamilies = ["nintendo", "playstation", "xbox", "sega", "pc", "other"];

export const platformFamilyLabels: Record<string, string> = {
  nintendo: "Nintendo",
  playstation: "PlayStation",
  xbox: "Xbox",
  sega: "SEGA",
  pc: "PC",
  other: "Other",
};

const currentPlatformIds = new Set([
  "switch_1",
  "switch_2",
  "ps5",
  "xbox_series_xs",
  "pc",
  "macos",
  "linux",
  "cups",
]);

const retroPlatformIds = new Set([
  "atari_2600",
  "dreamcast",
  "ds",
  "game_gear",
  "gamecube",
  "gb",
  "gba",
  "gbc",
  "genesis",
  "n64",
  "neo_geo",
  "nes",
  "ps1",
  "ps2",
  "ps3",
  "psp",
  "saturn",
  "sega_master_system",
  "snes",
  "wii",
  "wii_u",
  "xbox_360",
  "xbox_original",
]);

export const platformPresets = [
  {
    id: "current",
    label: "Current systems",
    description: "Modern consoles and computers.",
    matches: (platform: ProductPlatformOption) => currentPlatformIds.has(platform.platformId),
    Icon: Gamepad2,
  },
  {
    id: "nintendo",
    label: "Nintendo",
    description: "Switch, handhelds, and classic Nintendo.",
    matches: (platform: ProductPlatformOption) => platform.family === "nintendo",
    Icon: Gamepad2,
  },
  {
    id: "playstation",
    label: "PlayStation",
    description: "Sony home and handheld systems.",
    matches: (platform: ProductPlatformOption) => platform.family === "playstation",
    Icon: Gamepad2,
  },
  {
    id: "xbox",
    label: "Xbox",
    description: "Xbox generations and current consoles.",
    matches: (platform: ProductPlatformOption) => platform.family === "xbox",
    Icon: Gamepad2,
  },
  {
    id: "pc",
    label: "PC",
    description: "Desktop and computer platforms.",
    matches: (platform: ProductPlatformOption) =>
      platform.family === "pc" || platform.kind === "computer",
    Icon: Laptop,
  },
  {
    id: "retro",
    label: "Retro",
    description: "Older consoles and handhelds.",
    matches: (platform: ProductPlatformOption) =>
      retroPlatformIds.has(platform.platformId) ||
      ["sega", "atari", "snk"].includes(platform.family),
    Icon: Tv,
  },
];

export type PlatformPreset = (typeof platformPresets)[number];

export const quickSuggestions = [
  "Elden Ring",
  "Hades",
  "Hollow Knight",
  "Portal 2",
  "The Witcher 3",
];

export function formatPlatformFamily(family: string) {
  return (
    platformFamilyLabels[family] ??
    family
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

export function selectedPlatformIdSet(platforms: Array<{ platformId: string }>) {
  return new Set(platforms.map((entry) => entry.platformId));
}

// Safety net on top of the "new profiles default to every platform selected" behavior
// (see withDefaultPlatforms in playfit-context.tsx): with 0 platforms selected, the
// recommendation engine treats every known game as not_on_platforms and excludes it from
// Play Next entirely, so a selection can shrink but must never bottom out at empty.
export function withPlatformSelectionGuard<T extends { platformId: string }>(
  current: T[],
  next: T[],
): T[] {
  return next.length === 0 && current.length > 0 ? current : next;
}

/**
 * Decides what a Quick Group preset click should do to the current onboarding
 * platform selection.
 *
 * Fresh onboarding starts with every known platform pre-selected (see
 * withDefaultPlatforms) so a fully-skipped flow still has an eligible catalog.
 * The Quick Groups are additive toggles designed for building a selection up
 * from nothing ("Start broad by selecting quick groups") -- against that
 * all-selected starting point, a plain toggle inverts: clicking the one group
 * a first-time user actually owns (e.g. "Nintendo") *removes* it, leaving
 * every platform they DON'T own still selected. While the selection is still
 * exactly the untouched default, a preset click instead narrows the
 * selection down to just that preset -- matching what "select this group"
 * obviously means to a first-time user. Once the user has made any explicit
 * change, presets go back to normal additive/removable toggle behavior.
 */
export function nextPlatformSelectionForPreset<T extends { platformId: string }>(
  current: T[],
  presetIds: string[],
  totalPlatformCount: number,
  buildEntry: (platformId: string) => T,
): T[] {
  if (presetIds.length === 0) return current;

  const stillDefaultAllPlatforms = totalPlatformCount > 0 && current.length === totalPlatformCount;
  if (stillDefaultAllPlatforms) {
    return presetIds.map(buildEntry);
  }

  const currentIds = selectedPlatformIdSet(current);
  const presetFullySelected = presetIds.every((id) => currentIds.has(id));

  if (presetFullySelected) {
    const remaining = current.filter((entry) => !presetIds.includes(entry.platformId));
    return withPlatformSelectionGuard(current, remaining);
  }

  return [
    ...current.filter((entry) => !presetIds.includes(entry.platformId)),
    ...presetIds.map(buildEntry),
  ];
}
