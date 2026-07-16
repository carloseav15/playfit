import type { ProductPlatformOption } from "@playfit/core/types";
import { Gamepad2, Laptop, Tv } from "lucide-react";

export const tastePlatformFamilies = ["nintendo", "playstation", "xbox", "sega", "pc", "other"];

const tastePlatformCurrentIds = new Set([
  "switch_1",
  "switch_2",
  "ps5",
  "xbox_series_xs",
  "pc",
  "macos",
  "linux",
  "cups",
]);

const tastePlatformRetroIds = new Set([
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

export const tastePlatformPresets: Array<{
  id: string;
  label: string;
  description: string;
  matches: (platform: ProductPlatformOption) => boolean;
  Icon: typeof Gamepad2;
}> = [
  {
    id: "current",
    label: "Current systems",
    description: "Modern consoles and computers.",
    matches: (p) => tastePlatformCurrentIds.has(p.platformId),
    Icon: Gamepad2,
  },
  {
    id: "nintendo",
    label: "Nintendo",
    description: "Switch, handhelds, and classic Nintendo.",
    matches: (p) => p.family === "nintendo",
    Icon: Gamepad2,
  },
  {
    id: "playstation",
    label: "PlayStation",
    description: "Sony home and handheld systems.",
    matches: (p) => p.family === "playstation",
    Icon: Gamepad2,
  },
  {
    id: "xbox",
    label: "Xbox",
    description: "Xbox generations and current consoles.",
    matches: (p) => p.family === "xbox",
    Icon: Gamepad2,
  },
  {
    id: "pc",
    label: "PC",
    description: "Desktop and computer platforms.",
    matches: (p) => p.family === "pc" || p.kind === "computer",
    Icon: Laptop,
  },
  {
    id: "retro",
    label: "Retro",
    description: "Older consoles and handhelds.",
    matches: (p) =>
      tastePlatformRetroIds.has(p.platformId) || ["sega", "atari", "snk"].includes(p.family),
    Icon: Tv,
  },
];

const tastePlatformFamilyLabels: Record<string, string> = {
  nintendo: "Nintendo",
  playstation: "PlayStation",
  xbox: "Xbox",
  sega: "SEGA",
  pc: "PC",
  other: "Other",
};

export function formatTastePlatformFamily(family: string) {
  return (
    tastePlatformFamilyLabels[family] ??
    family
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

export const desktopFamilyIcons: Record<string, typeof Gamepad2> = {
  nintendo: Gamepad2,
  playstation: Gamepad2,
  xbox: Gamepad2,
  sega: Tv,
  pc: Laptop,
  other: Tv,
};

export const platformKindLabels: Record<ProductPlatformOption["kind"], string> = {
  console: "Console",
  handheld: "Handheld",
  hybrid: "Hybrid",
  computer: "Computer",
  other: "Other",
};
