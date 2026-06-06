const ALL_TAGS = [
  "story_rich",
  "lore_heavy",
  "minimalist_story",
  "branching_narrative",
  "emergent_narrative",
  "text_based",
  "turn_based",
  "real_time",
  "stealth",
  "puzzle",
  "rhythm",
  "souls_like",
  "platformer",
  "shooter",
  "hack_and_slash",
  "tactical",
  "deck_building",
  "survival",
  "crafting",
  "base_building",
  "farming",
  "racing",
  "fighting",
  "bullet_hell",
  "exploration",
  "parkour",
  "immersive_sim",
  "social_deduction",
  "open_world",
  "linear",
  "hub_based",
  "mission_based",
  "roguelike",
  "metroidvania",
  "sandbox",
  "procedural",
  "episodic",
  "horde_mode",
  "kingdom_building",
  "dungeon_crawler",
  "single_player",
  "co_op",
  "competitive_multiplayer",
  "local_multiplayer",
  "online_multiplayer",
  "asynchronous_multiplayer",
  "mmo",
  "cross_platform",
  "dark",
  "lighthearted",
  "whimsical",
  "grounded",
  "satirical",
  "comedy",
  "melancholic",
  "hopeful",
  "cozy",
  "surreal",
  "demanding",
  "challenging",
  "accessible",
  "adaptive_difficulty",
  "unforgiving",
  "chill",
  "practice_required",
  "easy_mode_available",
  "short_sessions",
  "medium_sessions",
  "long_sessions",
  "pick_up_and_play",
  "marathon",
  "save_anywhere",
  "pixel_art",
  "realism",
  "cel_shaded",
  "hand_drawn",
  "low_poly",
  "voxel",
  "vector_art",
  "3d_cg",
  "photorealistic",
  "minimalist_art",
  "cinematic",
  "aaa",
  "aa",
  "indie",
  "experimental",
  "aaa_adjacent",
  "retro_revival",
  "fantasy",
  "sci_fi",
  "historical",
  "modern",
  "post_apocalyptic",
  "horror",
  "cyberpunk",
  "western",
  "mythological",
  "steampunk",
  "lovecraftian",
  "prehistoric",
  "noir",
  "melee_focused",
  "ranged_focused",
  "tactical_combat",
  "real_time_combat",
  "turn_based_combat",
  "action_combat",
  "no_combat",
  "bullet_hell_combat",
  "stealth_combat",
  "rhythm_combat",
  "dodge_and_parry",
  "first_person",
  "third_person",
  "top_down",
  "side_scroller",
  "isometric",
  "first_person_3d",
  "third_person_3d",
  "2d_flat",
  "2_5d",
  "vr",
  "under_5h",
  "5_10h",
  "10_30h",
  "30_60h",
  "60_100h",
  "100h_plus",
  "endless",
  "great_soundtrack",
  "atmospheric_audio",
  "voice_acted",
  "minimalist_audio",
  "chiptune",
  "high_replayability",
  "new_game_plus",
  "post_game_content",
  "moddable",
  "achievement_hunting",
  "speedrun_friendly",
  "multiple_endings",
] as const;

export type Tag = (typeof ALL_TAGS)[number];

export const ALL_TAG_SET: ReadonlySet<string> = new Set(ALL_TAGS);

export function isValidTag(value: string): value is Tag {
  return ALL_TAG_SET.has(value);
}

export function normalizeTags(tags: string[]): Tag[] {
  return tags.filter(isValidTag);
}

export function tagVector(tags: string[]): Record<string, number> {
  const vector: Record<string, number> = {};
  for (const tag of normalizeTags(tags)) {
    vector[tag] = 1;
  }
  return vector;
}

export function cosineSimilarity(tagsA: string[], tagsB: string[]): number {
  const vecA = tagVector(tagsA);
  const vecB = tagVector(tagsB);
  const uniqueKeys = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const key of uniqueKeys) {
    const a = vecA[key] ?? 0;
    const b = vecB[key] ?? 0;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

export function vectorMagnitude(vector: Record<string, number>): number {
  return Math.sqrt(Object.values(vector).reduce((sum, val) => sum + val * val, 0));
}

export function dotProduct(a: Record<string, number>, b: Record<string, number>): number {
  let sum = 0;
  for (const key of Object.keys(a)) {
    if (b[key]) sum += a[key] * b[key];
  }
  return sum;
}
