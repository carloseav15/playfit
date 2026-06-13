-- Seed platforms table with known catalog entries
begin;

insert into games_library.platforms (id, name, family, vendor, kind, gen)
values
  ('switch_2',          'Nintendo Switch 2',       'nintendo',    'Nintendo',   'hybrid',   10),
  ('ps5',               'PlayStation 5',           'playstation', 'Sony',       'console',  9),
  ('xbox_series_xs',    'Xbox Series X|S',         'xbox',        'Microsoft',  'console',  9),
  ('switch_1',          'Nintendo Switch',         'nintendo',    'Nintendo',   'hybrid',   9),
  ('ps4',               'PlayStation 4',           'playstation', 'Sony',       'console',  8),
  ('xbox_one',          'Xbox One',                'xbox',        'Microsoft',  'console',  8),
  ('wii_u',             'Wii U',                   'nintendo',    'Nintendo',   'console',  8),
  ('3ds',               'Nintendo 3DS',            'nintendo',    'Nintendo',   'handheld', 8),
  ('ps_vita',           'PS Vita',                 'playstation', 'Sony',       'handheld', 8),
  ('ps3',               'PlayStation 3',           'playstation', 'Sony',       'console',  7),
  ('xbox_360',          'Xbox 360',                'xbox',        'Microsoft',  'console',  7),
  ('wii',               'Wii',                     'nintendo',    'Nintendo',   'console',  7),
  ('psp',               'PSP',                     'playstation', 'Sony',       'handheld', 7),
  ('ds',                'Nintendo DS',             'nintendo',    'Nintendo',   'handheld', 7),
  ('ps2',               'PlayStation 2',           'playstation', 'Sony',       'console',  6),
  ('gamecube',          'GameCube',                'nintendo',    'Nintendo',   'console',  6),
  ('gba',               'Game Boy Advance',        'nintendo',    'Nintendo',   'handheld', 6),
  ('dreamcast',         'Dreamcast',               'sega',        'SEGA',       'console',  6),
  ('xbox_original',     'Xbox',                    'xbox',        'Microsoft',  'console',  6),
  ('ps1',               'PlayStation',             'playstation', 'Sony',       'console',  5),
  ('n64',               'Nintendo 64',             'nintendo',    'Nintendo',   'console',  5),
  ('saturn',            'Saturn',                  'sega',        'SEGA',       'console',  5),
  ('snes',              'SNES',                    'nintendo',    'Nintendo',   'console',  4),
  ('genesis',           'Genesis',                 'sega',        'SEGA',       'console',  4),
  ('gbc',               'Game Boy Color',          'nintendo',    'Nintendo',   'handheld', 4),
  ('nes',               'NES',                     'nintendo',    'Nintendo',   'console',  3),
  ('gb',                'Game Boy',                'nintendo',    'Nintendo',   'handheld', 4),
  ('pc',                'PC',                      'pc',          'PC',         'computer', 0),
  ('macos',             'macOS',                   'pc',          'Apple',      'computer', 0),
  ('ios',               'iOS',                     'apple',       'Apple',      'other',    0),
  ('android',           'Android',                 'google',      'Google',     'other',    0),
  ('linux',             'Linux',                   'pc',          'Linux',      'computer', 0),
  ('sega_master_system','Sega Master System',      'sega',        'SEGA',       'console',  3),
  ('neo_geo',           'Neo Geo',                 'snk',         'SNK',        'console',  4),
  ('game_gear',         'Game Gear',               'sega',        'SEGA',       'handheld', 3),
  ('atari_2600',        'Atari 2600',              'atari',       'Atari',      'console',  2)
on conflict (id) do nothing;

commit;
