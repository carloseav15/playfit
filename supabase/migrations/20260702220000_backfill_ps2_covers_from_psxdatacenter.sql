-- Adds cover art for 75 PS2 games (matched via psxdatacenter.com, see
-- 20260702210000) that were missing a cover_url. Images were downloaded
-- from psxdatacenter.com's predictable images2/covers/{SERIAL}.jpg path
-- and committed to apps/web/public/covers/games/, following the same
-- local-cover convention as the rest of the catalog.
--
-- Idempotent: only applies where cover_url is still empty/null.
begin;

with backfill(game_id, cover_url) as (
  values
    ('ben_10_protector_of_earth', '/covers/games/ben_10_protector_of_earth.jpg'),
    ('breeders_cup_world_thoroughbred_championships', '/covers/games/breeders_cup_world_thoroughbred_championships.jpg'),
    ('cyber_troopers_virtual_on_marz', '/covers/games/cyber_troopers_virtual_on_marz.jpg'),
    ('d1_professional_drift_grand_prix_series', '/covers/games/d1_professional_drift_grand_prix_series.jpg'),
    ('dance_dance_revolution_supernova', '/covers/games/dance_dance_revolution_supernova.jpg'),
    ('disney_s_chicken_little', '/covers/games/disney_s_chicken_little.jpg'),
    ('disney_s_pk_out_of_the_shadows', '/covers/games/disney_s_pk_out_of_the_shadows.jpg'),
    ('dreamworks_kung_fu_panda', '/covers/games/dreamworks_kung_fu_panda.jpg'),
    ('dreamworks_madagascar', '/covers/games/dreamworks_madagascar.jpg'),
    ('dreamworks_shrek_smash_n_crash_racing', '/covers/games/dreamworks_shrek_smash_n_crash_racing.jpg'),
    ('dreamworks_shrek_the_third', '/covers/games/dreamworks_shrek_the_third.jpg'),
    ('driving_emotion_type_s', '/covers/games/driving_emotion_type_s.jpg'),
    ('eagle_eye_golf', '/covers/games/eagle_eye_golf.jpg'),
    ('endgame', '/covers/games/endgame.jpg'),
    ('espn_international_winter_sports_2002', '/covers/games/espn_international_winter_sports_2002.jpg'),
    ('ferrari_f355_challenge', '/covers/games/ferrari_f355_challenge.jpg'),
    ('fifa_soccer_12', '/covers/games/fifa_soccer_12.jpg'),
    ('finny_the_fish_the_seven_waters', '/covers/games/finny_the_fish_the_seven_waters.jpg'),
    ('flipnic_ultimate_pinball', '/covers/games/flipnic_ultimate_pinball.jpg'),
    ('flow_urban_dance_uprising', '/covers/games/flow_urban_dance_uprising.jpg'),
    ('frogger_ancient_shadow', '/covers/games/frogger_ancient_shadow.jpg'),
    ('g1_jockey_3', '/covers/games/g1_jockey_3.jpg'),
    ('ghosthunter', '/covers/games/ghosthunter.jpg'),
    ('gladius', '/covers/games/gladius.jpg'),
    ('hannspree_ten_kate_honda_sbk', '/covers/games/hannspree_ten_kate_honda_sbk.jpg'),
    ('hot_shots_golf_fore', '/covers/games/hot_shots_golf_fore.jpg'),
    ('indigo_prophecy', '/covers/games/indigo_prophecy.jpg'),
    ('le_mans_24_hours', '/covers/games/le_mans_24_hours.jpg'),
    ('legion_the_legend_of_excalibur', '/covers/games/legion_the_legend_of_excalibur.jpg'),
    ('let_s_ride_silver_buckle_stables', '/covers/games/let_s_ride_silver_buckle_stables.jpg'),
    ('mad_maestro', '/covers/games/mad_maestro.jpg'),
    ('made_man_confessions_of_the_family_blood', '/covers/games/made_man_confessions_of_the_family_blood.jpg'),
    ('magna_carta_tears_of_blood', '/covers/games/magna_carta_tears_of_blood.jpg'),
    ('mat_hoffman_s_pro_bmx_2', '/covers/games/mat_hoffman_s_pro_bmx_2.jpg'),
    ('mcfarlane_s_evil_prophecy', '/covers/games/mcfarlane_s_evil_prophecy.jpg'),
    ('mercury_meltdown_remix', '/covers/games/mercury_meltdown_remix.jpg'),
    ('metal_slug_4_5', '/covers/games/metal_slug_4_5.jpg'),
    ('metropolismania', '/covers/games/metropolismania.jpg'),
    ('midnight_club_ii', '/covers/games/midnight_club_ii.jpg'),
    ('nba_street', '/covers/games/nba_street.jpg'),
    ('outlaw_tennis', '/covers/games/outlaw_tennis.jpg'),
    ('pac_man_world_2', '/covers/games/pac_man_world_2.jpg'),
    ('rc_revenge_pro', '/covers/games/rc_revenge_pro.jpg'),
    ('samurai_jack_the_shadow_of_aku', '/covers/games/samurai_jack_the_shadow_of_aku.jpg'),
    ('sd_gundam_force_showdown', '/covers/games/sd_gundam_force_showdown.jpg'),
    ('seek_and_destroy', '/covers/games/seek_and_destroy.jpg'),
    ('sega_classics_collection', '/covers/games/sega_classics_collection.jpg'),
    ('shin_megami_tensei_nocturne', '/covers/games/shin_megami_tensei_nocturne.jpg'),
    ('silent_scope_2_dark_silhouette', '/covers/games/silent_scope_2_dark_silhouette.jpg'),
    ('silpheed_the_lost_planet', '/covers/games/silpheed_the_lost_planet.jpg'),
    ('smash_court_tennis_pro_tournament', '/covers/games/smash_court_tennis_pro_tournament.jpg'),
    ('smash_court_tennis_pro_tournament_2', '/covers/games/smash_court_tennis_pro_tournament_2.jpg'),
    ('soldier_of_fortune_gold_edition', '/covers/games/soldier_of_fortune_gold_edition.jpg'),
    ('space_channel_5_special_edition', '/covers/games/space_channel_5_special_edition.jpg'),
    ('spider_man', '/covers/games/spider_man.jpg'),
    ('spider_man_2', '/covers/games/spider_man_2.jpg'),
    ('star_trek_shattered_universe', '/covers/games/star_trek_shattered_universe.jpg'),
    ('star_wars_battlefront', '/covers/games/star_wars_battlefront.jpg'),
    ('star_wars_super_bombad_racing', '/covers/games/star_wars_super_bombad_racing.jpg'),
    ('street_fighter_ex3', '/covers/games/street_fighter_ex3.jpg'),
    ('super_monkey_ball_deluxe', '/covers/games/super_monkey_ball_deluxe.jpg'),
    ('swing_away_golf', '/covers/games/swing_away_golf.jpg'),
    ('teenage_mutant_ninja_turtles', '/covers/games/teenage_mutant_ninja_turtles.jpg'),
    ('the_adventures_of_jimmy_neutron_boy_genius_attack_of_the_twonkies', '/covers/games/the_adventures_of_jimmy_neutron_boy_genius_attack_of_the_twonkies.jpg'),
    ('time_crisis_crisis_zone', '/covers/games/time_crisis_crisis_zone.jpg'),
    ('tom_clancy_s_rainbow_six_3', '/covers/games/tom_clancy_s_rainbow_six_3.jpg'),
    ('total_overdose_a_gunslinger_s_tale_in_mexico', '/covers/games/total_overdose_a_gunslinger_s_tale_in_mexico.jpg'),
    ('ty_the_tasmanian_tiger', '/covers/games/ty_the_tasmanian_tiger.jpg'),
    ('vietcong_purple_haze', '/covers/games/vietcong_purple_haze.jpg'),
    ('wave_rally', '/covers/games/wave_rally.jpg'),
    ('whiplash', '/covers/games/whiplash.jpg'),
    ('world_tour_soccer_2002', '/covers/games/world_tour_soccer_2002.jpg'),
    ('wta_tour_tennis', '/covers/games/wta_tour_tennis.jpg'),
    ('xiaolin_showdown', '/covers/games/xiaolin_showdown.jpg'),
    ('yanya_caballista_city_skater', '/covers/games/yanya_caballista_city_skater.jpg')
)
update games_library.games g
set cover_url = b.cover_url
from backfill b
where g.game_id = b.game_id
  and (g.cover_url = '' or g.cover_url is null);

commit;
