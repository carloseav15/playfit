-- View backing the manual cover-review admin UI: one row per game that
-- currently has a cover_url, ordered by relevance (metacritic score desc,
-- then newest platform generation desc) so the highest-value games get
-- reviewed first. Read only via service role from the admin API route.
create or replace view games_library.cover_review_queue as
select
  g.game_id,
  g.title,
  g.cover_url,
  (
    select max(gs.critic_score)
    from games_library.game_scores gs
    where gs.game_id = g.game_id and gs.score_source = 'metacritic'
  ) as metacritic_score,
  (
    select max(p.gen)
    from games_library.game_platforms gp
    join games_library.platforms p on p.id = gp.platform_id
    where gp.game_id = g.game_id
  ) as max_platform_gen,
  (
    select array_agg(p.name order by p.gen desc)
    from games_library.game_platforms gp
    join games_library.platforms p on p.id = gp.platform_id
    where gp.game_id = g.game_id
  ) as platform_names
from games_library.games g
where g.cover_url is not null and g.cover_url <> '';

grant select on games_library.cover_review_queue to service_role;
