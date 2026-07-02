-- Cover review batch from a manual pass over local cover files.
-- Two independent changes:
--   1. Unlink 6 games whose local cover file was manually reviewed and
--      rejected (deleted from apps/web/public/covers/games/).
--   2. Relink 85 games from an external cover_url (rawg/wikipedia/steam) to
--      an already-existing local cover file, matched by game_id == filename.
-- Idempotent: each statement only touches rows still in the expected
-- "before" state, so re-running after either environment already has the
-- change applied is a safe no-op.
begin;

update games_library.games
set cover_url = ''
where game_id in (
  'advance_wars_1_and_2',
  'alan_wake_2',
  'blasphemous_2',
  'bravely_second',
  'chrono_trigger_ds',
  'deaths_door'
)
and cover_url <> '';

with relink(game_id, filename) as (
  values
    ('007_first_light','007_first_light.jpg'),
    ('assassin_s_creed_ii','assassin_s_creed_ii.jpg'),
    ('black','black.jpg'),
    ('bravely_second_end_layer','bravely_second_end_layer.jpg'),
    ('catherine_full_body','catherine_full_body.jpg'),
    ('crimson_desert','crimson_desert.jpg'),
    ('crisis_core_final_fantasy_vii','crisis_core_final_fantasy_vii.jpg'),
    ('daxter','daxter.jpg'),
    ('dead_space_2','dead_space_2.jpg'),
    ('dead_space_3','dead_space_3.jpg'),
    ('deus_ex','deus_ex.jpg'),
    ('dissidia_final_fantasy','dissidia_final_fantasy.jpg'),
    ('dragon_quest_v','dragon_quest_v.png'),
    ('dragon_s_crown','dragon_s_crown.jpg'),
    ('dragon_s_crown_pro','dragon_s_crown_pro.jpg'),
    ('fahrenheit_indigo_prophecy','fahrenheit_indigo_prophecy.jpg'),
    ('far_cry_3','far_cry_3.jpg'),
    ('final_fantasy_tactics','final_fantasy_tactics.jpg'),
    ('final_fantasy_x_2','final_fantasy_x_2.jpg'),
    ('forza_horizon_6','forza_horizon_6.jpg'),
    ('grand_theft_auto_iv','grand_theft_auto_iv.jpg'),
    ('hey_pikmin','hey_pikmin.jpg'),
    ('inkonbini_one_store_many_stories','inkonbini_one_store_many_stories.jpg'),
    ('kirby_planet_robobot','kirby_planet_robobot.jpg'),
    ('lego_batman_legacy_of_the_dark_knight','lego_batman_legacy_of_the_dark_knight.jpg'),
    ('life_is_strange','life_is_strange.jpg'),
    ('luigi_s_mansion_dark_moon','luigi_s_mansion_dark_moon.jpg'),
    ('marvel_s_wolverine','marvel_s_wolverine.jpg'),
    ('metal_gear_acid','metal_gear_acid.jpg'),
    ('metal_gear_solid_2_sons_of_liberty','metal_gear_solid_2_sons_of_liberty.jpg'),
    ('metroid_prime_pinball','metroid_prime_pinball.jpg'),
    ('mina_the_hollower','mina_the_hollower.jpg'),
    ('minecraft','minecraft.jpg'),
    ('mixtape','mixtape.jpg'),
    ('monument_valley_3','monument_valley_3.jpg'),
    ('new_super_mario_bros_2','new_super_mario_bros_2.jpg'),
    ('odin_sphere','odin_sphere.jpg'),
    ('odin_sphere_leifthrasir','odin_sphere_leifthrasir.jpg'),
    ('okamiden','okamiden.jpg'),
    ('paper_mario_color_splash','paper_mario_color_splash.jpg'),
    ('paper_mario_sticker_star','paper_mario_sticker_star.jpg'),
    ('parasite_eve_ii','parasite_eve_ii.jpg'),
    ('persona_4_golden','persona_4_golden.jpg'),
    ('phoenix_wright_ace_attorney_trilogy','phoenix_wright_ace_attorney_trilogy.jpg'),
    ('pok_mon_pokopia','pok_mon_pokopia.jpg'),
    ('pragmata','pragmata.jpg'),
    ('prince_of_persia_revelations','prince_of_persia_revelations.jpg'),
    ('prince_of_persia_rival_swords','prince_of_persia_rival_swords.jpg'),
    ('rayman_legends_retold','rayman_legends_retold.jpg'),
    ('saros','saros.jpg'),
    ('silent_hill_4_the_room','silent_hill_4_the_room.jpg'),
    ('solatorobo_red_the_hunter','solatorobo_red_the_hunter.jpg'),
    ('stardew_valley','stardew_valley.jpg'),
    ('super_mario_64','super_mario_64.jpg'),
    ('super_mario_bros_2','super_mario_bros_2.jpg'),
    ('super_mario_sunshine','super_mario_sunshine.jpg'),
    ('super_metroid','super_metroid.jpg'),
    ('super_paper_mario','super_paper_mario.jpg'),
    ('tactics_ogre_let_us_cling_together','tactics_ogre_let_us_cling_together.jpg'),
    ('tekken_5_dark_resurrection','tekken_5_dark_resurrection.jpg'),
    ('the_3rd_birthday','the_3rd_birthday.jpg'),
    ('the_elder_scrolls_v_skyrim','the_elder_scrolls_v_skyrim.jpg'),
    ('the_great_ace_attorney_chronicles','the_great_ace_attorney_chronicles.jpg'),
    ('the_last_of_us_left_behind','the_last_of_us_left_behind.jpg'),
    ('the_legend_of_zelda_skyward_sword','the_legend_of_zelda_skyward_sword.jpg'),
    ('the_legend_of_zelda_the_wind_waker','the_legend_of_zelda_the_wind_waker.jpg'),
    ('the_legend_of_zelda_the_wind_waker_hd','the_legend_of_zelda_the_wind_waker_hd.jpg'),
    ('the_legend_of_zelda_twilight_princess','the_legend_of_zelda_twilight_princess.jpg'),
    ('the_legend_of_zelda_twilight_princess_hd','the_legend_of_zelda_twilight_princess_hd.jpg'),
    ('the_wonderful_101','the_wonderful_101.jpg'),
    ('tokyo_mirage_sessions_fe','tokyo_mirage_sessions_fe.jpg'),
    ('uncharted_golden_abyss','uncharted_golden_abyss.jpg'),
    ('valkyria_chronicles_ii','valkyria_chronicles_ii.jpg'),
    ('valkyrie_profile','valkyrie_profile.jpg'),
    ('warioware_gold','warioware_gold.jpg'),
    ('warioware_inc_mega_microgame','warioware_inc_mega_microgame.jpg'),
    ('warioware_touched','warioware_touched.jpg'),
    ('xenoblade_chronicles_x','xenoblade_chronicles_x.jpg'),
    ('yoshi','yoshi.jpg'),
    ('yoshi_s_island_ds','yoshi_s_island_ds.jpg'),
    ('yoshi_s_new_island','yoshi_s_new_island.jpg'),
    ('yoshi_s_woolly_world','yoshi_s_woolly_world.jpg'),
    ('ys_seven','ys_seven.jpg'),
    ('yu_gi_oh_forbidden_memories','yu_gi_oh_forbidden_memories.jpg'),
    ('marvels_guardians_of_the_galaxy','marvels_guardians_of_the_galaxy.jpg'),
    ('metal_gear_solid_3','metal_gear_solid_3.jpg'),
    ('metal_gear_solid_4','metal_gear_solid_4.jpg'),
    ('need_for_speed_most_wanted','need_for_speed_most_wanted.jpg'),
    ('ridge_racer_1995','ridge_racer.jpg')
)
update games_library.games g
set cover_url = 'covers/games/' || r.filename
from relink r
where g.game_id = r.game_id
  and g.cover_url like 'http%';

commit;

-- Down:
-- Not auto-reversed. The unlinked games' original external cover_url values
-- are not recoverable from this migration; the relinked games' prior
-- external cover_url values are likewise not stored here. Both changes are
-- low-risk (cover art only) and were manually reviewed before applying.
