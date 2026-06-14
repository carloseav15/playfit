-- Allow reviewed canonical game_id renames to preserve child rows.
begin;

alter table games_library.game_aliases
  drop constraint if exists game_aliases_game_id_fkey;
alter table games_library.game_aliases
  add constraint game_aliases_game_id_fkey
  foreign key (game_id)
  references games_library.games(game_id)
  on update cascade
  on delete cascade;

alter table games_library.game_platforms
  drop constraint if exists game_platforms_game_id_fkey;
alter table games_library.game_platforms
  add constraint game_platforms_game_id_fkey
  foreign key (game_id)
  references games_library.games(game_id)
  on update cascade
  on delete cascade;

alter table games_library.game_tags
  drop constraint if exists game_tags_game_id_fkey;
alter table games_library.game_tags
  add constraint game_tags_game_id_fkey
  foreign key (game_id)
  references games_library.games(game_id)
  on update cascade
  on delete cascade;

alter table games_library.user_game_states
  drop constraint if exists user_game_states_game_id_fkey;
alter table games_library.user_game_states
  add constraint user_game_states_game_id_fkey
  foreign key (game_id)
  references games_library.games(game_id)
  on update cascade
  on delete cascade;

commit;

-- Down:
-- begin;
-- alter table games_library.game_aliases drop constraint if exists game_aliases_game_id_fkey;
-- alter table games_library.game_aliases add constraint game_aliases_game_id_fkey
--   foreign key (game_id) references games_library.games(game_id) on delete cascade;
-- alter table games_library.game_platforms drop constraint if exists game_platforms_game_id_fkey;
-- alter table games_library.game_platforms add constraint game_platforms_game_id_fkey
--   foreign key (game_id) references games_library.games(game_id) on delete cascade;
-- alter table games_library.game_tags drop constraint if exists game_tags_game_id_fkey;
-- alter table games_library.game_tags add constraint game_tags_game_id_fkey
--   foreign key (game_id) references games_library.games(game_id) on delete cascade;
-- alter table games_library.user_game_states drop constraint if exists user_game_states_game_id_fkey;
-- alter table games_library.user_game_states add constraint user_game_states_game_id_fkey
--   foreign key (game_id) references games_library.games(game_id) on delete cascade;
-- commit;
