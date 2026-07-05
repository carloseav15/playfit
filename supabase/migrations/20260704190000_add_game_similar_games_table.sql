-- "You might also like" data from IGDB's similar_games field. Unlike series
-- (franchises/collections, a structural relation), this is IGDB's own
-- recommendation signal (genre/style/era similarity) - verified NOT useful
-- as a series-detection heuristic (only 10.8% of matches shared the same
-- series in a live sample), so kept as its own separate, purely additive
-- table rather than feeding into games.series_id.
--
-- Self-referential: both game_ref and similar_game_ref point to games.pk.
-- Directional as IGDB returns it (A listing B as similar doesn't guarantee
-- B lists A back) - not deduplicated into a symmetric relation.
create table if not exists games_library.game_similar_games (
  game_ref bigint not null references games_library.games(pk) on delete cascade,
  similar_game_ref bigint not null references games_library.games(pk) on delete cascade,
  game_id text not null,
  similar_game_id text not null,
  source text not null default 'igdb',
  created_at timestamptz not null default now(),
  primary key (game_ref, similar_game_ref),
  check (game_ref <> similar_game_ref)
);

create index if not exists game_similar_games_game_ref_idx
  on games_library.game_similar_games (game_ref);

alter table games_library.game_similar_games enable row level security;
create policy "public read game_similar_games" on games_library.game_similar_games for select using (true);

grant select on games_library.game_similar_games to anon, authenticated;
grant all privileges on games_library.game_similar_games to service_role;
