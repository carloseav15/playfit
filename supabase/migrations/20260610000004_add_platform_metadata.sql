begin;

-- Fase 4: Migrar metadata de plataformas del código TypeScript a la BD
-- Reemplaza el Record<string, PlatformMeta> hardcodeado en seeds.ts

alter table games_library.platforms
  add column if not exists family text not null default 'other',
  add column if not exists vendor text not null default 'Other',
  add column if not exists kind   text not null default 'other'
    check (kind in ('console', 'handheld', 'hybrid', 'computer', 'other')),
  add column if not exists gen    integer not null default 99;

comment on column games_library.platforms.family is 'Platform family: nintendo, playstation, xbox, sega, pc, apple, google, snk, atari, other';
comment on column games_library.platforms.kind   is 'Form factor: console, handheld, hybrid, computer, other';
comment on column games_library.platforms.gen    is 'Hardware generation number (0=non-console, 2-10)';
comment on column games_library.platforms.vendor is 'Manufacturer display name';

-- Poblar metadata desde el mapa conocido en seeds.ts (PlatformMeta)
update games_library.platforms set family='nintendo',    vendor='Nintendo',   kind='hybrid',    gen=10 where id='switch_2';
update games_library.platforms set family='playstation', vendor='Sony',       kind='console',   gen=9  where id='ps5';
update games_library.platforms set family='xbox',        vendor='Microsoft',  kind='console',   gen=9  where id='xbox_series_xs';
update games_library.platforms set family='nintendo',    vendor='Nintendo',   kind='hybrid',    gen=9  where id='switch_1';
update games_library.platforms set family='playstation', vendor='Sony',       kind='console',   gen=8  where id='ps4';
update games_library.platforms set family='xbox',        vendor='Microsoft',  kind='console',   gen=8  where id='xbox_one';
update games_library.platforms set family='nintendo',    vendor='Nintendo',   kind='console',   gen=8  where id='wii_u';
update games_library.platforms set family='nintendo',    vendor='Nintendo',   kind='handheld',  gen=8  where id='3ds';
update games_library.platforms set family='playstation', vendor='Sony',       kind='handheld',  gen=8  where id='ps_vita';
update games_library.platforms set family='playstation', vendor='Sony',       kind='console',   gen=7  where id='ps3';
update games_library.platforms set family='xbox',        vendor='Microsoft',  kind='console',   gen=7  where id='xbox_360';
update games_library.platforms set family='nintendo',    vendor='Nintendo',   kind='console',   gen=7  where id='wii';
update games_library.platforms set family='playstation', vendor='Sony',       kind='handheld',  gen=7  where id='psp';
update games_library.platforms set family='nintendo',    vendor='Nintendo',   kind='handheld',  gen=7  where id='ds';
update games_library.platforms set family='playstation', vendor='Sony',       kind='console',   gen=6  where id='ps2';
update games_library.platforms set family='nintendo',    vendor='Nintendo',   kind='console',   gen=6  where id='gamecube';
update games_library.platforms set family='nintendo',    vendor='Nintendo',   kind='handheld',  gen=6  where id='gba';
update games_library.platforms set family='sega',        vendor='SEGA',       kind='console',   gen=6  where id='dreamcast';
update games_library.platforms set family='xbox',        vendor='Microsoft',  kind='console',   gen=6  where id='xbox_original';
update games_library.platforms set family='playstation', vendor='Sony',       kind='console',   gen=5  where id='ps1';
update games_library.platforms set family='nintendo',    vendor='Nintendo',   kind='console',   gen=5  where id='n64';
update games_library.platforms set family='sega',        vendor='SEGA',       kind='console',   gen=5  where id='saturn';
update games_library.platforms set family='nintendo',    vendor='Nintendo',   kind='console',   gen=4  where id='snes';
update games_library.platforms set family='sega',        vendor='SEGA',       kind='console',   gen=4  where id='genesis';
update games_library.platforms set family='nintendo',    vendor='Nintendo',   kind='handheld',  gen=4  where id='gbc';
update games_library.platforms set family='nintendo',    vendor='Nintendo',   kind='console',   gen=3  where id='nes';
update games_library.platforms set family='nintendo',    vendor='Nintendo',   kind='handheld',  gen=4  where id='gb';
update games_library.platforms set family='pc',          vendor='PC',         kind='computer',  gen=0  where id='pc';
update games_library.platforms set family='pc',          vendor='Apple',      kind='computer',  gen=0  where id='macos';
update games_library.platforms set family='apple',       vendor='Apple',      kind='other',     gen=0  where id='ios';
update games_library.platforms set family='google',      vendor='Google',     kind='other',     gen=0  where id='android';
update games_library.platforms set family='pc',          vendor='Linux',      kind='computer',  gen=0  where id='linux';
update games_library.platforms set family='sega',        vendor='SEGA',       kind='console',   gen=3  where id='sega_master_system';
update games_library.platforms set family='snk',         vendor='SNK',        kind='console',   gen=4  where id='neo_geo';
update games_library.platforms set family='sega',        vendor='SEGA',       kind='handheld',  gen=3  where id='game_gear';
update games_library.platforms set family='atari',       vendor='Atari',      kind='console',   gen=2  where id='atari_2600';

commit;
