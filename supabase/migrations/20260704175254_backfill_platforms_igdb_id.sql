-- Manual mapping (36 platforms, verified against a live IGDB /platforms
-- query) from Playfit's platform ids to IGDB's platform ids. Needed to
-- resolve IGDB release_dates (per-platform) to a local platform_id.
update games_library.platforms set igdb_id = v.igdb_id
from (values
  ('android', 34),
  ('atari_2600', 59),
  ('dreamcast', 23),
  ('gb', 33),
  ('gba', 24),
  ('gbc', 22),
  ('game_gear', 35),
  ('gamecube', 21),
  ('genesis', 29),
  ('ios', 39),
  ('linux', 3),
  ('macos', 14),
  ('neo_geo', 80),
  ('nes', 18),
  ('3ds', 37),
  ('n64', 4),
  ('ds', 20),
  ('switch_1', 130),
  ('switch_2', 508),
  ('pc', 6),
  ('ps1', 7),
  ('ps2', 8),
  ('ps3', 9),
  ('ps4', 48),
  ('ps5', 167),
  ('ps_vita', 46),
  ('psp', 38),
  ('saturn', 32),
  ('sega_master_system', 64),
  ('snes', 19),
  ('wii', 5),
  ('wii_u', 41),
  ('xbox_original', 11),
  ('xbox_360', 12),
  ('xbox_one', 49),
  ('xbox_series_xs', 169)
) as v(id, igdb_id)
where games_library.platforms.id = v.id;
