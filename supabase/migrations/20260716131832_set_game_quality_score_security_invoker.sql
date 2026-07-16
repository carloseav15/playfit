-- The view is exposed to the Data API but is also used by the privileged
-- recommendation RPC. Make direct view access obey the caller's RLS context.
-- The underlying catalog tables already expose public SELECT policies where
-- direct access is part of the contract; game_scores remains private and is
-- therefore intentionally available through the recommendation RPC only.
create or replace view games_library.game_quality_score
with (security_invoker = true)
as
with critic_ranked as (
  select
    game_scores.game_id,
    game_scores.critic_score,
    game_scores.critic_count,
    row_number() over (
      partition by game_scores.game_id
      order by case game_scores.score_source
        when 'metacritic' then 1
        when 'metacritic_staging' then 2
        when 'igdb' then 3
        when 'rawg' then 4
        when 'vgsales' then 5
        when 'metacritic_review_sentiment' then 6
        else 7
      end
    ) as critic_rank
  from games_library.game_scores
  where game_scores.critic_score is not null
), user_ranked as (
  select
    game_scores.game_id,
    game_scores.user_score,
    game_scores.user_count,
    row_number() over (
      partition by game_scores.game_id
      order by case game_scores.score_source
        when 'rawg' then 1
        when 'metacritic' then 2
        when 'igdb' then 3
        when 'vgsales' then 4
        when 'metacritic_staging' then 5
        when 'metacritic_review_sentiment' then 6
        else 7
      end
    ) as user_rank
  from games_library.game_scores
  where game_scores.user_score is not null
)
select
  coalesce(c.game_id, u.game_id) as game_id,
  c.critic_score,
  u.user_score,
  c.critic_count,
  u.user_count
from (
  select game_id, critic_score, critic_count
  from critic_ranked
  where critic_rank = 1
) c
full join (
  select game_id, user_score, user_count
  from user_ranked
  where user_rank = 1
) u on u.game_id = c.game_id;
