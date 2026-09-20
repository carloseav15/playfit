-- Transactional synthetic catalog. The runner substitutes only catalog relations;
-- scoring function bodies, tag norms and permission boundaries remain real SQL.
create temp table review_games (
  game_id text, title text, tags text[], cover_url text, genre_id text,
  series_id text, release_state text, sort_date date
);
insert into review_games values
  ('story', 'Story', array['story_rich','tactical'], '', 'rpg', null, 'released', '2020-01-01'),
  ('horror', 'Horror', array['horror','dark'], '', 'horror', null, 'released', '2020-01-01'),
  ('chill', 'Chill', array['chill'], '', 'puzzle', null, 'released', '2020-01-01'),
  ('future', 'Future', array['story_rich'], '', 'rpg', null, 'unreleased', '2030-01-01'),
  ('elsewhere', 'Elsewhere', array['story_rich'], '', 'rpg', null, 'released', '2020-01-01'),
  ('sparse', 'Sparse', '{}', '', 'rpg', null, 'released', '2020-01-01'),
  ('hard', 'Hard', array['souls_like','demanding'], '', 'action', null, 'released', '2020-01-01');
create temp table review_platforms(game_id text, platform_id text);
insert into review_platforms select game_id, 'pc' from review_games where game_id <> 'elsewhere';
insert into review_platforms values ('elsewhere','switch');
create temp table review_quality(game_id text, critic_score numeric, user_score numeric, critic_count integer, user_count integer);
insert into review_quality values ('story',90,9,20,20), ('chill',75,7,2,2);
create temp table review_series(id text, name text);
