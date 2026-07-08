import type { SeedGame } from "@playfit/core/types";

export function calculateGameCoordinates(game: SeedGame): { x: number; y: number } {
  let x = 0; // Chill (-) vs Demanding (+)
  let y = 0; // Story/Linear (-) vs Open World/Systems (+)

  // X-axis: Chill vs Demanding
  const demandingTags = [
    "souls_like",
    "unforgiving",
    "demanding",
    "survival",
    "tactical",
    "deck_building",
    "stealth",
  ];
  const chillTags = [
    "chill",
    "cozy",
    "accessible",
    "short_sessions",
    "pick_up_and_play",
    "lighthearted",
  ];

  // Y-axis: Story/Linear vs Open World/Systems
  const systemsTags = ["open_world", "sandbox", "roguelike", "puzzle", "rhythm", "deck_building"];
  const storyTags = [
    "story_rich",
    "lore_heavy",
    "linear",
    "branching_narrative",
    "text_based",
    "horror",
    "dark",
  ];

  game.tags.forEach((tag) => {
    if (demandingTags.includes(tag)) x += 28;
    if (chillTags.includes(tag)) x -= 28;
    if (systemsTags.includes(tag)) y += 28;
    if (storyTags.includes(tag)) y -= 28;
  });

  // Fallback by genre if no tags matched
  if (x === 0 && y === 0) {
    const genre = (game.genreId ?? game.primaryGenre ?? "").toLowerCase();
    if (genre.includes("rpg") || genre.includes("role_playing")) {
      x += 10;
      y -= 20;
    } else if (genre.includes("action") || genre.includes("shooter")) {
      x += 20;
      y += 15;
    } else if (genre.includes("adventure") || genre.includes("indie")) {
      x -= 15;
      y -= 15;
    } else if (genre.includes("strategy") || genre.includes("simulation")) {
      x += 25;
      y += 25;
    } else if (genre.includes("puzzle") || genre.includes("casual")) {
      x -= 25;
      y += 20;
    }
  }

  // Add deterministic jitter based on gameId to prevent complete overlapping
  let hash = 0;
  for (let i = 0; i < game.gameId.length; i++) {
    hash = game.gameId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const jitterX = (hash % 16) - 8;
  const jitterY = ((hash >> 4) % 16) - 8;

  x += jitterX;
  y += jitterY;

  return {
    x: Math.max(-90, Math.min(90, x)),
    y: Math.max(-90, Math.min(90, y)),
  };
}

// Translate coordinate from [-100, 100] scale to SVG Viewbox [20, 380]
export const scaleCoordinateX = (val: number) => 200 + (val / 100) * 160;
export const scaleCoordinateY = (val: number) => 200 - (val / 100) * 160; // Invert Y for standard Cartesian
