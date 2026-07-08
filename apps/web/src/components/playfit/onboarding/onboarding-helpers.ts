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
