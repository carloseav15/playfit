-- Apply a reviewed duplicate merge batch from the manual_year_review lane.
-- Scope: 175 groups where the recommended winner has strictly more platform,
-- tag, alias, or cover coverage than the runner-up. Excludes 11 groups found
-- during manual review to be false positives:
--   - dragonquestiii, dragonwarrioriii, finalfantasyiii, langrisseriii,
--     shenmueiii: title-normalization collisions where an "X & Y" compilation
--     title concatenates to the same group_key as a distinct "X III" entry
--     (e.g. "Dragon Quest I & II" collides with "Dragon Quest III").
--   - io, robox, choroq, muse, oo, revolt: short/generic titles with
--     different source refs, large release-year gaps, and no confirming
--     signal that they are the same underlying game.
begin;

do $$
declare
  v_existing_approved int := 0;
  v_groups_present int := 0;
  v_result record;
begin
  with chosen(group_key, winner_game_id) as (
    values
      ('8bitboy','8_bit_boy'),
      ('aerotheacrobat','aero_the_acro_bat'),
      ('aerotheacrobat2','aero_the_acro_bat_2'),
      ('babyboom','baby_boom'),
      ('baseballsimulator1000','baseball_simulator_1_000'),
      ('battlemaster','battle_master'),
      ('blackjack','blackjack'),
      ('blazbluechronophantasmaextend','blazblue_chrono_phantasma_extend'),
      ('bodycount','bodycount'),
      ('breakpoint','breakpoint'),
      ('caesarspalace','caesars_palace'),
      ('calciobit','calciobit'),
      ('castlequest','castlequest'),
      ('choujikuuyousaimacross','choujikuu_yousai_macross'),
      ('cocotofunfair','cocoto_funfair'),
      ('corpsepartybloodcoveredrepeatedfear','corpse_party_blood_covered_repeated_fear'),
      ('crackdown','crackdown'),
      ('cyberbotsfullmetalmadness','cyberbots_fullmetal_madness'),
      ('daisenryakuviiexceed','dai_senryaku_vii_exceed'),
      ('dancedancerevolution','dance_dance_revolution'),
      ('danganronpa2goodbyedespair','danganronpa_2_goodbye_despair'),
      ('danganronpatriggerhappyhavoc','danganronpa_trigger_happy_havoc'),
      ('darkandlight','darkandlight'),
      ('destiny2','destiny_2_2017'),
      ('djmaxportable3','djmax_portable_3'),
      ('djmaxportableblacksquare','dj_max_portable_black_square'),
      ('dodonpachidaioujou','dodonpachi_daioujou'),
      ('doom3','doom_3'),
      ('doomii','doom_ii'),
      ('earthbound','earthbound_1994'),
      ('earthdefenseforce2017','earth_defense_force_2017'),
      ('elementsofdestruction','elements_of_destruction'),
      ('ever17outofinfinity','ever17_out_of_infinity'),
      ('eyetoyplay3','eyetoy_play_3'),
      ('f1grandprix','f1_grand_prix'),
      ('f1worldgrandprix','f_1_world_grand_prix'),
      ('f1worldgrandprixii','f1_world_grand_prix_ii'),
      ('fablethelostchapters','fable_the_lost_chapters'),
      ('factorio','factorio_2020'),
      ('farcry','far_cry'),
      ('fareastofedeniimanjimaru','far_east_of_eden_ii_manji_maru'),
      ('fear','f_e_a_r'),
      ('fez','fez'),
      ('fightershistorydynamite','fighters_history_dynamite'),
      ('finaldoom','final_doom'),
      ('finalfantasyviii','final_fantasy_viii'),
      ('firefly','firefly'),
      ('fishingmaster','fishing_master'),
      ('flatout','flatout'),
      ('flockit','flockit'),
      ('freakoutextremefreeride','freak_out_extreme_freeride'),
      ('futurecoplapd','future_cop_lapd'),
      ('galaxian3','galaxian3'),
      ('ginseishogikyoutendotoufuuraijin','ginsei_shogi_kyoutendotou_fuuraijin'),
      ('grandtheftauto','grand_theft_auto'),
      ('grandtheftauto2','grand_theft_auto_2'),
      ('grandtheftautoepisodesfromlibertycity','grand_theft_auto_episodes_from_liberty_city_2009'),
      ('grandtheftautoiii','grand_theft_auto_iii'),
      ('grandtheftautosanandreas','grand_theft_auto_san_andreas'),
      ('grandtheftautov','grand_theft_auto_v_2013'),
      ('grandtheftautovicecity','grand_theft_auto_vice_city'),
      ('guitarfreaksv2drummaniav2','guitarfreaks_v2_drummania_v2'),
      ('guitarfreaksv3drummaniav3','guitarfreaks_v3_drummania_v3'),
      ('harmoknight','harmoknight'),
      ('hexenbeyondheretic','hexen_beyond_heretic'),
      ('hitman2silentassassin','hitman_2_silent_assassin'),
      ('hitmanbloodmoney','hitman_blood_money'),
      ('hitmancontracts','hitman_contracts'),
      ('humanfallflat','human_fall_flat_2019'),
      ('hyperdimensionneptuniarebirth1','hyperdimension_neptunia_re_birth1'),
      ('hyperdimensionneptuniarebirth3vgeneration','hyperdimension_neptunia_re_birth3_v_generation'),
      ('imagefight','image_fight'),
      ('jetsetradio','jet_set_radio'),
      ('jumpjumpjump','jump_jump_jump'),
      ('kablooey','kablooey'),
      ('kawasakisnowmobiles','kawasaki_snow_mobiles'),
      ('kenkabanchootomekanzenmuketsunomyhoney','kenka_bancho_otome_kanzenmuketsu_no_my_honey'),
      ('kungfumaster','kung_fu_master'),
      ('legacyofkaindefiance','legacy_of_kain_defiance_2003'),
      ('legocityundercover','lego_city_undercover'),
      ('limbo','limbo_2010'),
      ('lipsilovethe80s','lips_i_love_the_80_s'),
      ('lostmagic','lostmagic'),
      ('mafiaii','mafia_ii_2010'),
      ('mahjong','mahjong'),
      ('manhunt','manhunt'),
      ('maxpayne','max_payne'),
      ('maxpayne2thefallofmaxpayne','max_payne_2_the_fall_of_max_payne'),
      ('megamanx','megaman_x'),
      ('metalslug3','metal_slug_3'),
      ('metroexodus','metro_exodus_2019'),
      ('monsterseed','monster_seed'),
      ('mountbladeiibannerlord','mount_blade_ii_bannerlord_2022'),
      ('muvluv','muv_luv'),
      ('muvluvalternative','muvluv_alternative'),
      ('neogeoheroesultimateshooting','neogeo_heroes_ultimate_shooting'),
      ('never7theendofinfinity','never_7_the_end_of_infinity'),
      ('nflblitz2002','nfl_blitz_20_02'),
      ('nightsintodreams','nights_into_dreams'),
      ('nightwatch','nightwatch'),
      ('oddworldabesexoddus','oddworld_abe_s_exoddus'),
      ('offroad','offroad'),
      ('outrun','out_run'),
      ('pacmania','pac_mania'),
      ('paperplane','paperplane'),
      ('planeshift','planeshift'),
      ('psychonauts','psychonauts'),
      ('punchline','punch_line'),
      ('pushover','pushover'),
      ('puyopuyotetris','puyo_puyo_tetris'),
      ('quake','quake'),
      ('quakeii','quake_ii'),
      ('quakeiiiarena','quake_iii_arena'),
      ('raymanorigins','rayman_r_origins'),
      ('raystorm','ray_storm'),
      ('reloaded','re_loaded'),
      ('rengokuiithestairwaytoheaven','rengoku_ii_the_stairway_to_h_e_a_v_e_n'),
      ('returntocastlewolfenstein','return_to_castle_wolfenstein'),
      ('rimworld','rimworld_2016'),
      ('rocksmith','rocksmith_2011'),
      ('rodland','rodland'),
      ('rubikscube','rubik_s_cube'),
      ('samegame','samegame'),
      ('sangokushieiketsuden','sangokushi_eiketsuden'),
      ('sangokushiv','sangokushi_v'),
      ('sangokushivi','sangokushi_vi'),
      ('sealifesafari','sealife_safari'),
      ('shmup','shmup'),
      ('shootingrange','shooting_range'),
      ('sidmeierspirates','sid_meier_s_pirates'),
      ('simcity2000','simcity_2000'),
      ('skykid','skykid'),
      ('sonicadventure2','sonic_adventure_2'),
      ('soulcaliburii','soul_calibur_ii'),
      ('spinmaster','spin_master'),
      ('spyhunter','spy_hunter'),
      ('starforce','star_force'),
      ('starshipsurvivor','starship_survivor'),
      ('steamworldheist','steamworld_heist'),
      ('steinsgate','steins_gate'),
      ('syberia','syberia'),
      ('tacheroesbigredone','t_a_c_heroes_big_red_one'),
      ('technocop','techno_cop'),
      ('tengaimakyiimanjimaru','tengai_makyo_ii_manji_maru'),
      ('thelegendofheroestrailsinthesky','the_legend_of_heroes_trails_in_the_sky_2006'),
      ('themisshitsukaranodasshutsu','the_misshitsukara_no_dasshutsu'),
      ('tnnmotorsportshardcore4x4','tnn_motorsports_hardcore_4x4'),
      ('tnnmotorsportshardcoretr','tnn_motorsports_hardcore_tr'),
      ('tokyo23kuseifukuwars','tokyo_23_ku_seifuku_wars'),
      ('tokyotwilightghosthunters','tokyo_twilight_ghost_hunters'),
      ('tombraiderivthelastrevelation','tomb_raider_iv_the_last_revelation'),
      ('tombraiderlegend','tomb_raider_legend'),
      ('tombraidervchronicles','tomb_raider_v_chronicles'),
      ('tomclancyssplintercell','tom_clancy_s_splinter_cell'),
      ('tomclancyssplintercellchaostheory','tom_clancy_s_splinter_cell_chaos_theory'),
      ('tomclancyssplintercelldoubleagent','tom_clancy_s_splinter_cell_double_agent'),
      ('touchdownfever','touch_down_fever'),
      ('towerfallascension','towerfall_ascension'),
      ('troubleshooter','troubleshooter'),
      ('tsukumonogatari','tsukumonogatari'),
      ('tumblepop','tumblepop'),
      ('ultimatedoom','ultimate_doom'),
      ('ultimatemarvelvscapcom3','ultimate_marvel_vs_capcom_3'),
      ('universeatwarearthassault','universe_at_war_earth_assault'),
      ('vip','vip'),
      ('warchess','warchess'),
      ('wildfire','wild_fire'),
      ('wolfenstein3d','wolfenstein_3d'),
      ('wonderboyiiithedragonstrap','wonder_boy_iii_the_dragon_s_trap'),
      ('worldclassleaderboardgolf','world_class_leader_board_golf'),
      ('wormsarmageddon','worms_armageddon'),
      ('xtypeplus','x_type_plus'),
      ('yakuza0','yakuza_0_2015'),
      ('yarsrevenge','yars_revenge'),
      ('zodasrevengestartropicsii','zoda_s_revenge_startropics_ii')
  )
  select count(*)::int into v_groups_present
  from chosen c
  join games_library.game_duplicate_groups g on g.group_key = c.group_key
  where g.status = 'needs_review';

  if v_groups_present = 0 then
    raise notice 'manual_year_review merge batch skipped: chosen groups are absent or already processed.';
    return;
  end if;

  if v_groups_present <> 175 then
    raise exception 'Expected 175 needs_review chosen groups, found %', v_groups_present;
  end if;

  select count(*)::int into v_existing_approved
  from games_library.game_duplicate_groups
  where status = 'approved';

  if v_existing_approved <> 0 then
    raise exception 'Expected 0 pre-existing approved duplicate groups, found %', v_existing_approved;
  end if;

  with chosen(group_key, winner_game_id) as (
    values
      ('8bitboy','8_bit_boy'),
      ('aerotheacrobat','aero_the_acro_bat'),
      ('aerotheacrobat2','aero_the_acro_bat_2'),
      ('babyboom','baby_boom'),
      ('baseballsimulator1000','baseball_simulator_1_000'),
      ('battlemaster','battle_master'),
      ('blackjack','blackjack'),
      ('blazbluechronophantasmaextend','blazblue_chrono_phantasma_extend'),
      ('bodycount','bodycount'),
      ('breakpoint','breakpoint'),
      ('caesarspalace','caesars_palace'),
      ('calciobit','calciobit'),
      ('castlequest','castlequest'),
      ('choujikuuyousaimacross','choujikuu_yousai_macross'),
      ('cocotofunfair','cocoto_funfair'),
      ('corpsepartybloodcoveredrepeatedfear','corpse_party_blood_covered_repeated_fear'),
      ('crackdown','crackdown'),
      ('cyberbotsfullmetalmadness','cyberbots_fullmetal_madness'),
      ('daisenryakuviiexceed','dai_senryaku_vii_exceed'),
      ('dancedancerevolution','dance_dance_revolution'),
      ('danganronpa2goodbyedespair','danganronpa_2_goodbye_despair'),
      ('danganronpatriggerhappyhavoc','danganronpa_trigger_happy_havoc'),
      ('darkandlight','darkandlight'),
      ('destiny2','destiny_2_2017'),
      ('djmaxportable3','djmax_portable_3'),
      ('djmaxportableblacksquare','dj_max_portable_black_square'),
      ('dodonpachidaioujou','dodonpachi_daioujou'),
      ('doom3','doom_3'),
      ('doomii','doom_ii'),
      ('earthbound','earthbound_1994'),
      ('earthdefenseforce2017','earth_defense_force_2017'),
      ('elementsofdestruction','elements_of_destruction'),
      ('ever17outofinfinity','ever17_out_of_infinity'),
      ('eyetoyplay3','eyetoy_play_3'),
      ('f1grandprix','f1_grand_prix'),
      ('f1worldgrandprix','f_1_world_grand_prix'),
      ('f1worldgrandprixii','f1_world_grand_prix_ii'),
      ('fablethelostchapters','fable_the_lost_chapters'),
      ('factorio','factorio_2020'),
      ('farcry','far_cry'),
      ('fareastofedeniimanjimaru','far_east_of_eden_ii_manji_maru'),
      ('fear','f_e_a_r'),
      ('fez','fez'),
      ('fightershistorydynamite','fighters_history_dynamite'),
      ('finaldoom','final_doom'),
      ('finalfantasyviii','final_fantasy_viii'),
      ('firefly','firefly'),
      ('fishingmaster','fishing_master'),
      ('flatout','flatout'),
      ('flockit','flockit'),
      ('freakoutextremefreeride','freak_out_extreme_freeride'),
      ('futurecoplapd','future_cop_lapd'),
      ('galaxian3','galaxian3'),
      ('ginseishogikyoutendotoufuuraijin','ginsei_shogi_kyoutendotou_fuuraijin'),
      ('grandtheftauto','grand_theft_auto'),
      ('grandtheftauto2','grand_theft_auto_2'),
      ('grandtheftautoepisodesfromlibertycity','grand_theft_auto_episodes_from_liberty_city_2009'),
      ('grandtheftautoiii','grand_theft_auto_iii'),
      ('grandtheftautosanandreas','grand_theft_auto_san_andreas'),
      ('grandtheftautov','grand_theft_auto_v_2013'),
      ('grandtheftautovicecity','grand_theft_auto_vice_city'),
      ('guitarfreaksv2drummaniav2','guitarfreaks_v2_drummania_v2'),
      ('guitarfreaksv3drummaniav3','guitarfreaks_v3_drummania_v3'),
      ('harmoknight','harmoknight'),
      ('hexenbeyondheretic','hexen_beyond_heretic'),
      ('hitman2silentassassin','hitman_2_silent_assassin'),
      ('hitmanbloodmoney','hitman_blood_money'),
      ('hitmancontracts','hitman_contracts'),
      ('humanfallflat','human_fall_flat_2019'),
      ('hyperdimensionneptuniarebirth1','hyperdimension_neptunia_re_birth1'),
      ('hyperdimensionneptuniarebirth3vgeneration','hyperdimension_neptunia_re_birth3_v_generation'),
      ('imagefight','image_fight'),
      ('jetsetradio','jet_set_radio'),
      ('jumpjumpjump','jump_jump_jump'),
      ('kablooey','kablooey'),
      ('kawasakisnowmobiles','kawasaki_snow_mobiles'),
      ('kenkabanchootomekanzenmuketsunomyhoney','kenka_bancho_otome_kanzenmuketsu_no_my_honey'),
      ('kungfumaster','kung_fu_master'),
      ('legacyofkaindefiance','legacy_of_kain_defiance_2003'),
      ('legocityundercover','lego_city_undercover'),
      ('limbo','limbo_2010'),
      ('lipsilovethe80s','lips_i_love_the_80_s'),
      ('lostmagic','lostmagic'),
      ('mafiaii','mafia_ii_2010'),
      ('mahjong','mahjong'),
      ('manhunt','manhunt'),
      ('maxpayne','max_payne'),
      ('maxpayne2thefallofmaxpayne','max_payne_2_the_fall_of_max_payne'),
      ('megamanx','megaman_x'),
      ('metalslug3','metal_slug_3'),
      ('metroexodus','metro_exodus_2019'),
      ('monsterseed','monster_seed'),
      ('mountbladeiibannerlord','mount_blade_ii_bannerlord_2022'),
      ('muvluv','muv_luv'),
      ('muvluvalternative','muvluv_alternative'),
      ('neogeoheroesultimateshooting','neogeo_heroes_ultimate_shooting'),
      ('never7theendofinfinity','never_7_the_end_of_infinity'),
      ('nflblitz2002','nfl_blitz_20_02'),
      ('nightsintodreams','nights_into_dreams'),
      ('nightwatch','nightwatch'),
      ('oddworldabesexoddus','oddworld_abe_s_exoddus'),
      ('offroad','offroad'),
      ('outrun','out_run'),
      ('pacmania','pac_mania'),
      ('paperplane','paperplane'),
      ('planeshift','planeshift'),
      ('psychonauts','psychonauts'),
      ('punchline','punch_line'),
      ('pushover','pushover'),
      ('puyopuyotetris','puyo_puyo_tetris'),
      ('quake','quake'),
      ('quakeii','quake_ii'),
      ('quakeiiiarena','quake_iii_arena'),
      ('raymanorigins','rayman_r_origins'),
      ('raystorm','ray_storm'),
      ('reloaded','re_loaded'),
      ('rengokuiithestairwaytoheaven','rengoku_ii_the_stairway_to_h_e_a_v_e_n'),
      ('returntocastlewolfenstein','return_to_castle_wolfenstein'),
      ('rimworld','rimworld_2016'),
      ('rocksmith','rocksmith_2011'),
      ('rodland','rodland'),
      ('rubikscube','rubik_s_cube'),
      ('samegame','samegame'),
      ('sangokushieiketsuden','sangokushi_eiketsuden'),
      ('sangokushiv','sangokushi_v'),
      ('sangokushivi','sangokushi_vi'),
      ('sealifesafari','sealife_safari'),
      ('shmup','shmup'),
      ('shootingrange','shooting_range'),
      ('sidmeierspirates','sid_meier_s_pirates'),
      ('simcity2000','simcity_2000'),
      ('skykid','skykid'),
      ('sonicadventure2','sonic_adventure_2'),
      ('soulcaliburii','soul_calibur_ii'),
      ('spinmaster','spin_master'),
      ('spyhunter','spy_hunter'),
      ('starforce','star_force'),
      ('starshipsurvivor','starship_survivor'),
      ('steamworldheist','steamworld_heist'),
      ('steinsgate','steins_gate'),
      ('syberia','syberia'),
      ('tacheroesbigredone','t_a_c_heroes_big_red_one'),
      ('technocop','techno_cop'),
      ('tengaimakyiimanjimaru','tengai_makyo_ii_manji_maru'),
      ('thelegendofheroestrailsinthesky','the_legend_of_heroes_trails_in_the_sky_2006'),
      ('themisshitsukaranodasshutsu','the_misshitsukara_no_dasshutsu'),
      ('tnnmotorsportshardcore4x4','tnn_motorsports_hardcore_4x4'),
      ('tnnmotorsportshardcoretr','tnn_motorsports_hardcore_tr'),
      ('tokyo23kuseifukuwars','tokyo_23_ku_seifuku_wars'),
      ('tokyotwilightghosthunters','tokyo_twilight_ghost_hunters'),
      ('tombraiderivthelastrevelation','tomb_raider_iv_the_last_revelation'),
      ('tombraiderlegend','tomb_raider_legend'),
      ('tombraidervchronicles','tomb_raider_v_chronicles'),
      ('tomclancyssplintercell','tom_clancy_s_splinter_cell'),
      ('tomclancyssplintercellchaostheory','tom_clancy_s_splinter_cell_chaos_theory'),
      ('tomclancyssplintercelldoubleagent','tom_clancy_s_splinter_cell_double_agent'),
      ('touchdownfever','touch_down_fever'),
      ('towerfallascension','towerfall_ascension'),
      ('troubleshooter','troubleshooter'),
      ('tsukumonogatari','tsukumonogatari'),
      ('tumblepop','tumblepop'),
      ('ultimatedoom','ultimate_doom'),
      ('ultimatemarvelvscapcom3','ultimate_marvel_vs_capcom_3'),
      ('universeatwarearthassault','universe_at_war_earth_assault'),
      ('vip','vip'),
      ('warchess','warchess'),
      ('wildfire','wild_fire'),
      ('wolfenstein3d','wolfenstein_3d'),
      ('wonderboyiiithedragonstrap','wonder_boy_iii_the_dragon_s_trap'),
      ('worldclassleaderboardgolf','world_class_leader_board_golf'),
      ('wormsarmageddon','worms_armageddon'),
      ('xtypeplus','x_type_plus'),
      ('yakuza0','yakuza_0_2015'),
      ('yarsrevenge','yars_revenge'),
      ('zodasrevengestartropicsii','zoda_s_revenge_startropics_ii')
  )
  update games_library.game_duplicate_candidates c
  set proposed_action = 'keep',
      winner_game_id = null,
      updated_at = now()
  from chosen ch
  where c.group_key = ch.group_key
    and c.game_id = ch.winner_game_id;

  with chosen(group_key, winner_game_id) as (
    values
      ('8bitboy','8_bit_boy'), ('aerotheacrobat','aero_the_acro_bat'),
      ('aerotheacrobat2','aero_the_acro_bat_2'), ('babyboom','baby_boom'),
      ('baseballsimulator1000','baseball_simulator_1_000'), ('battlemaster','battle_master'),
      ('blackjack','blackjack'), ('blazbluechronophantasmaextend','blazblue_chrono_phantasma_extend'),
      ('bodycount','bodycount'), ('breakpoint','breakpoint'),
      ('caesarspalace','caesars_palace'), ('calciobit','calciobit'),
      ('castlequest','castlequest'), ('choujikuuyousaimacross','choujikuu_yousai_macross'),
      ('cocotofunfair','cocoto_funfair'), ('corpsepartybloodcoveredrepeatedfear','corpse_party_blood_covered_repeated_fear'),
      ('crackdown','crackdown'), ('cyberbotsfullmetalmadness','cyberbots_fullmetal_madness'),
      ('daisenryakuviiexceed','dai_senryaku_vii_exceed'), ('dancedancerevolution','dance_dance_revolution'),
      ('danganronpa2goodbyedespair','danganronpa_2_goodbye_despair'), ('danganronpatriggerhappyhavoc','danganronpa_trigger_happy_havoc'),
      ('darkandlight','darkandlight'), ('destiny2','destiny_2_2017'),
      ('djmaxportable3','djmax_portable_3'), ('djmaxportableblacksquare','dj_max_portable_black_square'),
      ('dodonpachidaioujou','dodonpachi_daioujou'), ('doom3','doom_3'),
      ('doomii','doom_ii'), ('earthbound','earthbound_1994'),
      ('earthdefenseforce2017','earth_defense_force_2017'), ('elementsofdestruction','elements_of_destruction'),
      ('ever17outofinfinity','ever17_out_of_infinity'), ('eyetoyplay3','eyetoy_play_3'),
      ('f1grandprix','f1_grand_prix'), ('f1worldgrandprix','f_1_world_grand_prix'),
      ('f1worldgrandprixii','f1_world_grand_prix_ii'), ('fablethelostchapters','fable_the_lost_chapters'),
      ('factorio','factorio_2020'), ('farcry','far_cry'),
      ('fareastofedeniimanjimaru','far_east_of_eden_ii_manji_maru'), ('fear','f_e_a_r'),
      ('fez','fez'), ('fightershistorydynamite','fighters_history_dynamite'),
      ('finaldoom','final_doom'), ('finalfantasyviii','final_fantasy_viii'),
      ('firefly','firefly'), ('fishingmaster','fishing_master'),
      ('flatout','flatout'), ('flockit','flockit'),
      ('freakoutextremefreeride','freak_out_extreme_freeride'), ('futurecoplapd','future_cop_lapd'),
      ('galaxian3','galaxian3'), ('ginseishogikyoutendotoufuuraijin','ginsei_shogi_kyoutendotou_fuuraijin'),
      ('grandtheftauto','grand_theft_auto'), ('grandtheftauto2','grand_theft_auto_2'),
      ('grandtheftautoepisodesfromlibertycity','grand_theft_auto_episodes_from_liberty_city_2009'), ('grandtheftautoiii','grand_theft_auto_iii'),
      ('grandtheftautosanandreas','grand_theft_auto_san_andreas'), ('grandtheftautov','grand_theft_auto_v_2013'),
      ('grandtheftautovicecity','grand_theft_auto_vice_city'), ('guitarfreaksv2drummaniav2','guitarfreaks_v2_drummania_v2'),
      ('guitarfreaksv3drummaniav3','guitarfreaks_v3_drummania_v3'), ('harmoknight','harmoknight'),
      ('hexenbeyondheretic','hexen_beyond_heretic'), ('hitman2silentassassin','hitman_2_silent_assassin'),
      ('hitmanbloodmoney','hitman_blood_money'), ('hitmancontracts','hitman_contracts'),
      ('humanfallflat','human_fall_flat_2019'), ('hyperdimensionneptuniarebirth1','hyperdimension_neptunia_re_birth1'),
      ('hyperdimensionneptuniarebirth3vgeneration','hyperdimension_neptunia_re_birth3_v_generation'), ('imagefight','image_fight'),
      ('jetsetradio','jet_set_radio'), ('jumpjumpjump','jump_jump_jump'),
      ('kablooey','kablooey'), ('kawasakisnowmobiles','kawasaki_snow_mobiles'),
      ('kenkabanchootomekanzenmuketsunomyhoney','kenka_bancho_otome_kanzenmuketsu_no_my_honey'), ('kungfumaster','kung_fu_master'),
      ('legacyofkaindefiance','legacy_of_kain_defiance_2003'), ('legocityundercover','lego_city_undercover'),
      ('limbo','limbo_2010'), ('lipsilovethe80s','lips_i_love_the_80_s'),
      ('lostmagic','lostmagic'), ('mafiaii','mafia_ii_2010'),
      ('mahjong','mahjong'), ('manhunt','manhunt'),
      ('maxpayne','max_payne'), ('maxpayne2thefallofmaxpayne','max_payne_2_the_fall_of_max_payne'),
      ('megamanx','megaman_x'), ('metalslug3','metal_slug_3'),
      ('metroexodus','metro_exodus_2019'), ('monsterseed','monster_seed'),
      ('mountbladeiibannerlord','mount_blade_ii_bannerlord_2022'), ('muvluv','muv_luv'),
      ('muvluvalternative','muvluv_alternative'), ('neogeoheroesultimateshooting','neogeo_heroes_ultimate_shooting'),
      ('never7theendofinfinity','never_7_the_end_of_infinity'), ('nflblitz2002','nfl_blitz_20_02'),
      ('nightsintodreams','nights_into_dreams'), ('nightwatch','nightwatch'),
      ('oddworldabesexoddus','oddworld_abe_s_exoddus'), ('offroad','offroad'),
      ('outrun','out_run'), ('pacmania','pac_mania'),
      ('paperplane','paperplane'), ('planeshift','planeshift'),
      ('psychonauts','psychonauts'), ('punchline','punch_line'),
      ('pushover','pushover'), ('puyopuyotetris','puyo_puyo_tetris'),
      ('quake','quake'), ('quakeii','quake_ii'),
      ('quakeiiiarena','quake_iii_arena'), ('raymanorigins','rayman_r_origins'),
      ('raystorm','ray_storm'), ('reloaded','re_loaded'),
      ('rengokuiithestairwaytoheaven','rengoku_ii_the_stairway_to_h_e_a_v_e_n'), ('returntocastlewolfenstein','return_to_castle_wolfenstein'),
      ('rimworld','rimworld_2016'), ('rocksmith','rocksmith_2011'),
      ('rodland','rodland'), ('rubikscube','rubik_s_cube'),
      ('samegame','samegame'), ('sangokushieiketsuden','sangokushi_eiketsuden'),
      ('sangokushiv','sangokushi_v'), ('sangokushivi','sangokushi_vi'),
      ('sealifesafari','sealife_safari'), ('shmup','shmup'),
      ('shootingrange','shooting_range'), ('sidmeierspirates','sid_meier_s_pirates'),
      ('simcity2000','simcity_2000'), ('skykid','skykid'),
      ('sonicadventure2','sonic_adventure_2'), ('soulcaliburii','soul_calibur_ii'),
      ('spinmaster','spin_master'), ('spyhunter','spy_hunter'),
      ('starforce','star_force'), ('starshipsurvivor','starship_survivor'),
      ('steamworldheist','steamworld_heist'), ('steinsgate','steins_gate'),
      ('syberia','syberia'), ('tacheroesbigredone','t_a_c_heroes_big_red_one'),
      ('technocop','techno_cop'), ('tengaimakyiimanjimaru','tengai_makyo_ii_manji_maru'),
      ('thelegendofheroestrailsinthesky','the_legend_of_heroes_trails_in_the_sky_2006'), ('themisshitsukaranodasshutsu','the_misshitsukara_no_dasshutsu'),
      ('tnnmotorsportshardcore4x4','tnn_motorsports_hardcore_4x4'), ('tnnmotorsportshardcoretr','tnn_motorsports_hardcore_tr'),
      ('tokyo23kuseifukuwars','tokyo_23_ku_seifuku_wars'), ('tokyotwilightghosthunters','tokyo_twilight_ghost_hunters'),
      ('tombraiderivthelastrevelation','tomb_raider_iv_the_last_revelation'), ('tombraiderlegend','tomb_raider_legend'),
      ('tombraidervchronicles','tomb_raider_v_chronicles'), ('tomclancyssplintercell','tom_clancy_s_splinter_cell'),
      ('tomclancyssplintercellchaostheory','tom_clancy_s_splinter_cell_chaos_theory'), ('tomclancyssplintercelldoubleagent','tom_clancy_s_splinter_cell_double_agent'),
      ('touchdownfever','touch_down_fever'), ('towerfallascension','towerfall_ascension'),
      ('troubleshooter','troubleshooter'), ('tsukumonogatari','tsukumonogatari'),
      ('tumblepop','tumblepop'), ('ultimatedoom','ultimate_doom'),
      ('ultimatemarvelvscapcom3','ultimate_marvel_vs_capcom_3'), ('universeatwarearthassault','universe_at_war_earth_assault'),
      ('vip','vip'), ('warchess','warchess'),
      ('wildfire','wild_fire'), ('wolfenstein3d','wolfenstein_3d'),
      ('wonderboyiiithedragonstrap','wonder_boy_iii_the_dragon_s_trap'), ('worldclassleaderboardgolf','world_class_leader_board_golf'),
      ('wormsarmageddon','worms_armageddon'), ('xtypeplus','x_type_plus'),
      ('yakuza0','yakuza_0_2015'), ('yarsrevenge','yars_revenge'),
      ('zodasrevengestartropicsii','zoda_s_revenge_startropics_ii')
  )
  update games_library.game_duplicate_candidates c
  set proposed_action = 'merge_into_winner',
      winner_game_id = ch.winner_game_id,
      updated_at = now()
  from chosen ch
  where c.group_key = ch.group_key
    and c.game_id <> ch.winner_game_id;

  -- Pre-compress redirect chains: many losers in this batch are themselves the
  -- target of an older ingestion-time redirect (raw source id -> loser). The
  -- merge executor only creates a new loser->winner redirect; it does not
  -- shorten existing chains, so deleting the loser would otherwise violate
  -- game_redirects_to_game_id_fkey. Repoint those old redirects straight to
  -- the final winner first, and drop any that would become self-redirects.
  with losers(loser_game_id, winner_game_id) as (
    select c.game_id, c.winner_game_id
    from games_library.game_duplicate_candidates c
    where c.proposed_action = 'merge_into_winner'
      and c.winner_game_id is not null
  )
  delete from games_library.game_redirects r
  using losers l
  where r.to_game_id = l.loser_game_id
    and r.from_game_id = l.winner_game_id;

  with losers(loser_game_id, winner_game_id) as (
    select c.game_id, c.winner_game_id
    from games_library.game_duplicate_candidates c
    where c.proposed_action = 'merge_into_winner'
      and c.winner_game_id is not null
  )
  update games_library.game_redirects r
  set
    to_game_id = l.winner_game_id,
    notes = case
      when btrim(coalesce(r.notes, '')) = '' then 'Redirect chain compressed pre-merge through ' || l.loser_game_id
      else r.notes || E'\nRedirect chain compressed pre-merge through ' || l.loser_game_id
    end,
    updated_at = now()
  from losers l
  where r.to_game_id = l.loser_game_id;

  with chosen(group_key) as (
    values
      ('8bitboy'), ('aerotheacrobat'), ('aerotheacrobat2'), ('babyboom'),
      ('baseballsimulator1000'), ('battlemaster'), ('blackjack'), ('blazbluechronophantasmaextend'),
      ('bodycount'), ('breakpoint'), ('caesarspalace'), ('calciobit'),
      ('castlequest'), ('choujikuuyousaimacross'), ('cocotofunfair'), ('corpsepartybloodcoveredrepeatedfear'),
      ('crackdown'), ('cyberbotsfullmetalmadness'), ('daisenryakuviiexceed'), ('dancedancerevolution'),
      ('danganronpa2goodbyedespair'), ('danganronpatriggerhappyhavoc'), ('darkandlight'), ('destiny2'),
      ('djmaxportable3'), ('djmaxportableblacksquare'), ('dodonpachidaioujou'), ('doom3'),
      ('doomii'), ('earthbound'), ('earthdefenseforce2017'), ('elementsofdestruction'),
      ('ever17outofinfinity'), ('eyetoyplay3'), ('f1grandprix'), ('f1worldgrandprix'),
      ('f1worldgrandprixii'), ('fablethelostchapters'), ('factorio'), ('farcry'),
      ('fareastofedeniimanjimaru'), ('fear'), ('fez'), ('fightershistorydynamite'),
      ('finaldoom'), ('finalfantasyviii'), ('firefly'), ('fishingmaster'),
      ('flatout'), ('flockit'), ('freakoutextremefreeride'), ('futurecoplapd'),
      ('galaxian3'), ('ginseishogikyoutendotoufuuraijin'), ('grandtheftauto'), ('grandtheftauto2'),
      ('grandtheftautoepisodesfromlibertycity'), ('grandtheftautoiii'), ('grandtheftautosanandreas'), ('grandtheftautov'),
      ('grandtheftautovicecity'), ('guitarfreaksv2drummaniav2'), ('guitarfreaksv3drummaniav3'), ('harmoknight'),
      ('hexenbeyondheretic'), ('hitman2silentassassin'), ('hitmanbloodmoney'), ('hitmancontracts'),
      ('humanfallflat'), ('hyperdimensionneptuniarebirth1'), ('hyperdimensionneptuniarebirth3vgeneration'), ('imagefight'),
      ('jetsetradio'), ('jumpjumpjump'), ('kablooey'), ('kawasakisnowmobiles'),
      ('kenkabanchootomekanzenmuketsunomyhoney'), ('kungfumaster'), ('legacyofkaindefiance'), ('legocityundercover'),
      ('limbo'), ('lipsilovethe80s'), ('lostmagic'), ('mafiaii'),
      ('mahjong'), ('manhunt'), ('maxpayne'), ('maxpayne2thefallofmaxpayne'),
      ('megamanx'), ('metalslug3'), ('metroexodus'), ('monsterseed'),
      ('mountbladeiibannerlord'), ('muvluv'), ('muvluvalternative'), ('neogeoheroesultimateshooting'),
      ('never7theendofinfinity'), ('nflblitz2002'), ('nightsintodreams'), ('nightwatch'),
      ('oddworldabesexoddus'), ('offroad'), ('outrun'), ('pacmania'),
      ('paperplane'), ('planeshift'), ('psychonauts'), ('punchline'),
      ('pushover'), ('puyopuyotetris'), ('quake'), ('quakeii'),
      ('quakeiiiarena'), ('raymanorigins'), ('raystorm'), ('reloaded'),
      ('rengokuiithestairwaytoheaven'), ('returntocastlewolfenstein'), ('rimworld'), ('rocksmith'),
      ('rodland'), ('rubikscube'), ('samegame'), ('sangokushieiketsuden'),
      ('sangokushiv'), ('sangokushivi'), ('sealifesafari'), ('shmup'),
      ('shootingrange'), ('sidmeierspirates'), ('simcity2000'), ('skykid'),
      ('sonicadventure2'), ('soulcaliburii'), ('spinmaster'), ('spyhunter'),
      ('starforce'), ('starshipsurvivor'), ('steamworldheist'), ('steinsgate'),
      ('syberia'), ('tacheroesbigredone'), ('technocop'), ('tengaimakyiimanjimaru'),
      ('thelegendofheroestrailsinthesky'), ('themisshitsukaranodasshutsu'), ('tnnmotorsportshardcore4x4'), ('tnnmotorsportshardcoretr'),
      ('tokyo23kuseifukuwars'), ('tokyotwilightghosthunters'), ('tombraiderivthelastrevelation'), ('tombraiderlegend'),
      ('tombraidervchronicles'), ('tomclancyssplintercell'), ('tomclancyssplintercellchaostheory'), ('tomclancyssplintercelldoubleagent'),
      ('touchdownfever'), ('towerfallascension'), ('troubleshooter'), ('tsukumonogatari'),
      ('tumblepop'), ('ultimatedoom'), ('ultimatemarvelvscapcom3'), ('universeatwarearthassault'),
      ('vip'), ('warchess'), ('wildfire'), ('wolfenstein3d'),
      ('wonderboyiiithedragonstrap'), ('worldclassleaderboardgolf'), ('wormsarmageddon'), ('xtypeplus'),
      ('yakuza0'), ('yarsrevenge'), ('zodasrevengestartropicsii')
  )
  update games_library.game_duplicate_groups g
  set
    status = 'approved',
    reviewed_by = 'migration_20260702150000',
    reviewed_at = now(),
    review_notes = case
      when btrim(g.review_notes) = '' then 'Approved manual_year_review merge batch (richness heuristic, false positives excluded).'
      else g.review_notes || E'\nApproved manual_year_review merge batch (richness heuristic, false positives excluded).'
    end,
    updated_at = now()
  from chosen c
  where g.group_key = c.group_key;

  select *
  into v_result
  from games_library_private.apply_approved_game_duplicate_merges(175);

  if v_result.groups_processed <> 175 then
    raise exception 'Unexpected manual_year_review merge result: groups %, retired %, redirects %',
      v_result.groups_processed,
      v_result.games_retired,
      v_result.redirects_created;
  end if;
end;
$$;

commit;

-- Down:
-- This batch is intentionally not auto-reversed. The merge executor stores
-- per-loser snapshots in games_library_private.game_duplicate_merge_items and
-- redirects in games_library.game_redirects, so any individual group can be
-- inspected or manually reconstructed if needed.
