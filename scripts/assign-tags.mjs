import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_SERVICE_KEY required.");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: "games_library" },
});

function normalize(t) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Series that have NO tagged examples — use static defaults
const FALLBACK_TAGS = {
  "Front Mission": ["tactical", "story_rich", "mecha", "turn_based_combat"],
  "Florence": ["story_rich", "indie", "short_sessions", "minimalist_art"],
  "Dead or Alive": ["fighting", "action_combat", "competitive_multiplayer"],
  "Coffee Talk": ["story_rich", "indie", "cozy", "minimalist_story"],
  "Deus Ex": ["immersive_sim", "story_rich", "stealth", "first_person", "cyberpunk"],
  "Katana Zero": ["action_combat", "indie", "2d_flat", "story_rich", "side_scroller"],
  "Shovel Knight": ["platformer", "action_combat", "indie", "retro_revival", "2d_flat"],
  "Animal Well": ["metroidvania", "indie", "surreal", "puzzle", "exploration"],
  "art of rally": ["racing", "indie", "top_down", "single_player"],
  "Arco": ["action_combat", "indie", "pixel_art", "top_down"],
  "Before We Leave": ["base_building", "indie", "city_building", "strategy"],
  "Black Myth: Wukong": ["action_combat", "aaa", "fantasy", "third_person", "story_rich"],
  "Black": ["shooter", "first_person", "action_combat", "single_player"],
  "Dave the Diver": ["indie", "exploration", "crafting", "adventure", "cozy"],
  "Dead Cells": ["roguelike", "action_combat", "indie", "2d_flat", "metroidvania"],
  "Crysis": ["shooter", "first_person", "sci_fi", "aaa", "action_combat"],
  "Cult of the Lamb": ["roguelike", "base_building", "indie", "dark", "action_combat"],
  "Cities: Skylines": ["city_building", "simulation", "strategy", "sandbox"],
  "Descenders": ["racing", "sports", "indie", "single_player"],
  "Dragon's Crown": ["action_combat", "fantasy", "co_op", "side_scroller", "hand_drawn"],
  "Fire Emblem": ["tactical", "turn_based_combat", "story_rich", "fantasy", "single_player"],
  "Persona": ["story_rich", "japanese", "turn_based_combat", "fantasy", "great_soundtrack"],
  "Super Mario": ["platformer", "action_combat", "whimsical", "single_player", "accessible"],
  "Pokémon": ["turn_based_combat", "fantasy", "single_player", "story_rich", "japanese"],
  "The Legend of Zelda": ["action_combat", "exploration", "fantasy", "single_player", "puzzle", "open_world"],
  "Metroid": ["metroidvania", "exploration", "action_combat", "sci_fi", "single_player"],
  "Kirby": ["platformer", "action_combat", "whimsical", "single_player", "accessible"],
  "Metal Gear": ["stealth", "story_rich", "action_combat", "single_player", "cinematic"],
  "Resident Evil": ["horror", "survival", "single_player", "action_combat", "third_person"],
  "God of War": ["action_combat", "hack_and_slash", "story_rich", "single_player", "third_person"],
  "Paper Mario": ["turn_based_combat", "story_rich", "whimsical", "single_player", "fantasy"],
  "Pikmin": ["real_time", "strategy", "single_player", "whimsical", "cozy"],
  "Assassin's Creed": ["open_world", "action_combat", "stealth", "single_player", "third_person", "historical"],
  "Devil May Cry": ["action_combat", "hack_and_slash", "single_player", "fantasy", "third_person"],
  "Silent Hill": ["horror", "survival", "single_player", "third_person", "atmospheric_audio"],
  "Dead or Alive": ["fighting", "action_combat", "competitive_multiplayer"],
  "Gears of War": ["shooter", "third_person", "action_combat", "single_player", "co_op"],
  "Need for Speed": ["racing", "single_player", "arcade", "open_world"],
  "Dragon Quest": ["turn_based_combat", "story_rich", "fantasy", "single_player", "japanese"],
  "Quantic Dream": ["story_rich", "cinematic", "branching_narrative", "single_player", "third_person"],
  "Mass Effect": ["story_rich", "sci_fi", "shooter", "third_person", "single_player", "rpg"],
  "WarioWare": ["rhythm", "party", "minigame", "comedy", "local_multiplayer", "pick_up_and_play"],
  "Alan Wake": ["horror", "story_rich", "survival", "third_person", "atmospheric_audio"],
  "Borderlands": ["shooter", "looter", "co_op", "comedy", "first_person", "sci_fi", "open_world"],
  "Kingdom Hearts": ["action_combat", "fantasy", "story_rich", "single_player", "japanese"],
  "Prince of Persia": ["platformer", "action_combat", "parkour", "single_player", "third_person"],
  "Doom": ["shooter", "first_person", "action_combat", "single_player", "sci_fi", "fast_paced"],
  "Fallout": ["open_world", "rpg", "post_apocalyptic", "first_person", "story_rich"],
  "Halo": ["shooter", "first_person", "sci_fi", "single_player", "multiplayer"],
  "The Witcher": ["rpg", "open_world", "story_rich", "third_person", "fantasy"],
  "Diablo": ["hack_and_slash", "action_combat", "looter", "fantasy", "isometric"],
  "Dark Souls": ["souls_like", "action_combat", "dark", "fantasy", "third_person", "challenging"],
  "BioShock": ["shooter", "first_person", "immersive_sim", "story_rich", "steampunk"],
  "Uncharted": ["third_person", "action_combat", "story_rich", "cinematic", "adventure"],
  "Castlevania": ["metroidvania", "action_combat", "platformer", "dark", "single_player"],
  "Far Cry": ["open_world", "first_person", "shooter", "action_combat", "single_player"],
  "Cyberpunk": ["open_world", "rpg", "first_person", "cyberpunk", "story_rich"],
  "Dead Space": ["horror", "survival", "shooter", "third_person", "sci_fi"],
  "Batman: Arkham": ["action_combat", "stealth", "third_person", "open_world", "single_player"],
  "Elden Ring": ["souls_like", "action_combat", "open_world", "fantasy", "third_person"],
  "Star Wars": ["sci_fi", "action_combat", "single_player", "third_person"],
  "Final Fantasy": ["rpg", "turn_based_combat", "story_rich", "fantasy", "single_player"],
  "Grand Theft Auto": ["open_world", "third_person", "action_combat", "sandbox", "single_player"],
  "Call of Duty": ["shooter", "first_person", "action_combat", "single_player", "multiplayer"],
  "Red Dead Redemption": ["open_world", "third_person", "western", "story_rich", "single_player"],
  "The Elder Scrolls": ["open_world", "rpg", "first_person", "third_person", "fantasy"],
  "Sonic the Hedgehog": ["platformer", "action_combat", "single_player", "3d_cg", "high_replayability"],
  "Mega Man": ["platformer", "action_combat", "single_player", "2d_flat", "challenging"],
  "Street Fighter": ["fighting", "action_combat", "competitive_multiplayer", "single_player"],
  "Tomb Raider": ["third_person", "action_combat", "exploration", "puzzle", "single_player"],
  "Mortal Kombat": ["fighting", "action_combat", "competitive_multiplayer", "dark"],
  "Tekken": ["fighting", "action_combat", "competitive_multiplayer", "single_player"],
  "Monster Hunter": ["action_combat", "rpg", "co_op", "single_player", "crafting", "fantasy"],
  "Yakuza": ["action_combat", "open_world", "story_rich", "comedy", "single_player"],
  "Hitman": ["stealth", "action_combat", "sandbox", "single_player", "third_person"],
  "Dragon Age": ["rpg", "story_rich", "fantasy", "single_player", "third_person"],
  "Crash Bandicoot": ["platformer", "action_combat", "single_player", "3d_cg", "whimsical"],
  "Spyro the Dragon": ["platformer", "action_combat", "single_player", "3d_cg", "whimsical", "exploration"],
  "Ratchet & Clank": ["platformer", "shooter", "action_combat", "third_person", "single_player", "sci_fi"],
  "Half-Life": ["shooter", "first_person", "story_rich", "single_player", "sci_fi"],
  "Portal": ["puzzle", "first_person", "single_player", "sci_fi", "comedy"],
  "Wolfenstein": ["shooter", "first_person", "action_combat", "single_player", "historical"],
  "Dishonored": ["stealth", "immersive_sim", "first_person", "single_player", "dark"],
  "Max Payne": ["shooter", "third_person", "story_rich", "single_player", "action_combat"],
  "Dead Rising": ["survival", "action_combat", "horror", "open_world", "single_player"],
  "Fatal Frame": ["horror", "survival", "single_player", "third_person", "atmospheric_audio"],
  "Life is Strange": ["story_rich", "episodic", "single_player", "branching_narrative", "cozy"],
  "The Last of Us": ["action_combat", "story_rich", "survival", "third_person", "single_player"],
  "Ghost of Tsushima": ["action_combat", "open_world", "stealth", "single_player", "third_person"],
  "NieR": ["action_combat", "story_rich", "rpg", "single_player", "post_apocalyptic"],
  "Xenoblade Chronicles": ["rpg", "open_world", "story_rich", "single_player", "fantasy"],
  "Splatoon": ["shooter", "third_person", "multiplayer", "action_combat", "whimsical"],
  "Animal Crossing": ["simulation", "cozy", "single_player", "multiplayer", "whimsical"],
  "Bayonetta": ["action_combat", "hack_and_slash", "single_player", "third_person", "fantasy"],
  "Guilty Gear": ["fighting", "action_combat", "competitive_multiplayer", "anime"],
  "BlazBlue": ["fighting", "action_combat", "competitive_multiplayer", "anime"],
  "The King of Fighters": ["fighting", "action_combat", "competitive_multiplayer", "single_player"],
  "Metal Slug": ["shooter", "arcade", "action_combat", "co_op", "2d_flat"],
  "Contra": ["shooter", "arcade", "action_combat", "co_op", "2d_flat", "run_and_gun"],
  "Ninja Gaiden": ["action_combat", "hack_and_slash", "single_player", "third_person", "challenging"],
  "Civilization": ["strategy", "turn_based", "single_player", "multiplayer", "historical"],
  "Age of Empires": ["strategy", "real_time", "single_player", "multiplayer", "historical"],
  "XCOM": ["tactical", "turn_based", "single_player", "sci_fi", "strategy"],
  "Warcraft": ["strategy", "fantasy", "real_time", "single_player", "multiplayer"],
  "StarCraft": ["strategy", "sci_fi", "real_time", "single_player", "multiplayer"],
  "The Walking Dead": ["story_rich", "episodic", "single_player", "horror", "branching_narrative"],
  "Horizon": ["open_world", "action_combat", "rpg", "story_rich", "single_player", "sci_fi"],
  "Bloodborne": ["souls_like", "action_combat", "dark", "single_player", "challenging", "gothic"],
  "Baldur's Gate": ["rpg", "turn_based_combat", "story_rich", "fantasy", "co_op"],
  "Stardew Valley": ["farming", "simulation", "cozy", "single_player", "indie", "crafting"],
  "Undertale": ["story_rich", "indie", "rpg", "single_player", "comedy"],
  "No Man's Sky": ["exploration", "sci_fi", "survival", "sandbox", "multiplayer"],
  "Outer Wilds": ["exploration", "story_rich", "sci_fi", "single_player", "indie"],
  "Hogwarts Legacy": ["open_world", "fantasy", "action_combat", "story_rich", "single_player"],
  "It Takes Two": ["co_op", "action_combat", "platformer", "whimsical", "story_rich"],
  "Little Nightmares": ["horror", "platformer", "puzzle", "single_player", "atmospheric_audio"],
  "Sifu": ["action_combat", "fighting", "single_player", "challenging", "indie"],
  "Psychonauts": ["platformer", "action_combat", "comedy", "single_player", "story_rich"],
  "Vampire Survivors": ["roguelike", "action_combat", "indie", "bullet_hell", "single_player"],
  "Super Smash Bros.": ["fighting", "multiplayer", "action_combat", "party", "local_multiplayer"],
  "Ace Attorney": ["story_rich", "puzzle", "single_player", "comedy", "visual_novel"],
  "Starfield": ["rpg", "open_world", "sci_fi", "first_person", "single_player"],
  "LEGO": ["action_combat", "co_op", "family", "whimsical", "platformer"],
  "Armored Core": ["mecha", "action_combat", "single_player", "third_person", "shooter"],
  "Star Fox": ["shooter", "third_person", "sci_fi", "single_player", "arcade"],
  "Ace Combat": ["simulation", "single_player", "arcade", "military"],
  "Injustice": ["fighting", "action_combat", "competitive_multiplayer", "single_player"],
  "Astro Bot": ["platformer", "action_combat", "whimsical", "single_player", "3d_cg"],
  "Teenage Mutant Ninja Turtles": ["action_combat", "co_op", "beat_em_up", "retro_revival"],
  "South Park": ["rpg", "comedy", "single_player", "fantasy", "satirical"],
  "Sayonara Wild Hearts": ["rhythm", "action_combat", "indie", "surreal", "single_player", "great_soundtrack"],
  "Okami": ["action_combat", "adventure", "fantasy", "single_player", "hand_drawn"],
  "Muramasa": ["action_combat", "fantasy", "single_player", "hand_drawn", "side_scroller"],
  "Gravity Rush": ["action_combat", "open_world", "single_player", "third_person", "anime"],
  "Catherine": ["puzzle", "single_player", "story_rich", "satirical"],
  "Odin Sphere": ["action_combat", "fantasy", "single_player", "hand_drawn", "side_scroller"],
  "Hyrule Warriors": ["action_combat", "hack_and_slash", "single_player", "co_op", "fantasy"],
  "Ghostwire": ["horror", "first_person", "action_combat", "single_player", "supernatural"],
  "Genshin Impact": ["open_world", "action_combat", "rpg", "multiplayer", "fantasy", "anime"],
  "Infinity Nikki": ["adventure", "cozy", "open_world", "single_player"],
  "Jusant": ["exploration", "puzzle", "single_player", "indie"],
  "Lords of the Fallen": ["souls_like", "action_combat", "dark", "fantasy", "single_player"],
  "The Callisto Protocol": ["horror", "survival", "third_person", "single_player", "action_combat"],
  "Monument Valley": ["puzzle", "single_player", "indie", "minimalist_art", "short_sessions"],
  "Sea of Stars": ["rpg", "turn_based_combat", "story_rich", "single_player", "indie"],
  "Fantasian": ["rpg", "turn_based_combat", "story_rich", "single_player", "fantasy"],
  "Broken Age": ["adventure", "puzzle", "single_player", "story_rich", "hand_drawn"],
  "Another Code": ["puzzle", "adventure", "single_player", "story_rich"],
  "EarthBound": ["rpg", "turn_based_combat", "story_rich", "single_player", "comedy"],
  "SNK vs. Capcom": ["fighting", "competitive_multiplayer", "single_player"],
  "Forza": ["racing", "simulation", "single_player", "multiplayer"],
  "FIFA": ["sports", "competitive_multiplayer", "single_player", "multiplayer"],
  "Warhammer 40,000": ["sci_fi", "action_combat", "shooter", "single_player", "co_op"],
  "Tom Clancy's": ["shooter", "tactical", "single_player", "co_op", "multiplayer"],
  "Yu-Gi-Oh!": ["card", "competitive_multiplayer", "single_player", "strategy"],
  "Day of the Tentacle": ["puzzle", "adventure", "comedy", "single_player", "point_and_click"],
  "Yoshi": ["platformer", "action_combat", "whimsical", "single_player", "accessible"],
  "Aliens": ["horror", "shooter", "sci_fi", "single_player", "action_combat"],
  "One Piece": ["action_combat", "anime", "single_player", "hack_and_slash", "adventure"],
};

async function main() {
  // Load all games
  const all = [];
  let from = 0;
  const pageSize = 1000;
  let done = false;
  while (!done) {
    const { data } = await supabase.from("games").select("game_id, title, tags").range(from, from + pageSize - 1);
    all.push(...(data ?? []));
    from += pageSize;
    if ((data ?? []).length < pageSize) done = true;
  }

  const untagged = all.filter(g => !g.tags || g.tags.length === 0);
  console.log(`Untagged series games: ${untagged.length}`);

  const apply = process.argv.includes("--apply");
  const updates = [];
  let borrowed = 0;
  let fallback = 0;

  for (const game of untagged) {
    let tags = null;

    // Strategy 1: fallback to static mapping by title matching
    const seriesKey = Object.keys(FALLBACK_TAGS).find(sk =>
      normalize(game.title).includes(normalize(sk)) ||
      normalize(sk).includes(normalize(game.title))
    );
    if (seriesKey) {
      tags = FALLBACK_TAGS[seriesKey];
    }
    if (tags) fallback++;

    // Strategy 2: minimal default
    if (!tags || tags.length === 0) {
      tags = ["single_player", "story_rich"];
    }

    updates.push({ game_id: game.game_id, tags });
  }

  console.log(`Using fallback mapping: ${fallback}`);
  console.log(`Using minimal defaults: ${updates.length - fallback}`);

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to write to database.");
    return;
  }

  const BATCH = 100;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (u) => {
        // Update games_tags join table
        const { error: delError } = await supabase
          .from("game_tags")
          .delete()
          .eq("game_id", u.game_id);
        if (delError) return console.error(`  Error deleting tags for ${u.game_id}: ${delError.message}`);

        if (u.tags.length > 0) {
          const { error: insError } = await supabase
            .from("game_tags")
            .insert(u.tags.map((tag) => ({ game_id: u.game_id, tag_id: tag })));
          if (insError) console.error(`  Error inserting tags for ${u.game_id}: ${insError.message}`);
        }

        // Keep games.tags denormalized cache in sync
        const { error: updateError } = await supabase
          .from("games")
          .update({ tags: u.tags })
          .eq("game_id", u.game_id);
        if (updateError) console.error(`  Error updating games.tags for ${u.game_id}: ${updateError.message}`);
      })
    );
    console.log(`  Batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(updates.length / BATCH)} OK`);
  }

  console.log(`\n=== Done ===`);
  console.log(`Updated: ${updates.length} games`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
