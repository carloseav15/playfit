-- Seeds the three new lookup tables with IGDB's fixed, small, stable value
-- sets (6 game_modes, 22 themes, 7 player_perspectives), verified live
-- against the IGDB API on 2026-07-04.
insert into games_library.game_modes (id, name, igdb_id) values
  ('single_player', 'Single player', 1),
  ('multiplayer', 'Multiplayer', 2),
  ('co_operative', 'Co-operative', 3),
  ('split_screen', 'Split screen', 4),
  ('massively_multiplayer_online_mmo', 'Massively Multiplayer Online (MMO)', 5),
  ('battle_royale', 'Battle Royale', 6)
on conflict (id) do nothing;

insert into games_library.themes (id, name, igdb_id) values
  ('theme_action', 'Action', 1),
  ('fantasy', 'Fantasy', 17),
  ('science_fiction', 'Science fiction', 18),
  ('horror', 'Horror', 19),
  ('thriller', 'Thriller', 20),
  ('survival', 'Survival', 21),
  ('historical', 'Historical', 22),
  ('stealth', 'Stealth', 23),
  ('comedy', 'Comedy', 27),
  ('business', 'Business', 28),
  ('drama', 'Drama', 31),
  ('non_fiction', 'Non-fiction', 32),
  ('sandbox', 'Sandbox', 33),
  ('educational_theme', 'Educational', 34),
  ('kids', 'Kids', 35),
  ('open_world', 'Open world', 38),
  ('warfare', 'Warfare', 39),
  ('party', 'Party', 40),
  ('theme_4x', '4X (explore, expand, exploit, and exterminate)', 41),
  ('erotic', 'Erotic', 42),
  ('mystery', 'Mystery', 43),
  ('romance', 'Romance', 44)
on conflict (id) do nothing;

insert into games_library.perspectives (id, name, igdb_id) values
  ('first_person', 'First person', 1),
  ('third_person', 'Third person', 2),
  ('bird_view_isometric', 'Bird view / Isometric', 3),
  ('side_view', 'Side view', 4),
  ('text', 'Text', 5),
  ('auditory', 'Auditory', 6),
  ('virtual_reality', 'Virtual Reality', 7)
on conflict (id) do nothing;
