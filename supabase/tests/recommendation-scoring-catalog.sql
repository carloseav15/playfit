-- Run against the actual local catalog; no fixture substitution or persistent writes.
select count(*) as catalog_games from games_library.games;
create temp table catalog_benchmark (
  scenario text, old_ms numeric, shared_ms numeric, exact_match boolean
);
create or replace function pg_temp.compare_catalog_case(case_name text, liked jsonb, disliked jsonb, rated integer)
returns void language plpgsql as $$
declare started timestamptz; old_result jsonb; new_result jsonb; old_ms numeric; new_ms numeric;
begin
  started := clock_timestamp();
  old_result := pg_temp.previous_score_today_recommendations(liked,disliked,'{}','{}',rated,'{}','{}','{}','{}',array['currentRun','resume','picks']);
  old_ms := extract(epoch from clock_timestamp()-started)*1000;
  started := clock_timestamp();
  new_result := games_library.score_today_recommendations(liked,disliked,'{}','{}',rated,'{}','{}','{}','{}',array['currentRun','resume','picks']);
  new_ms := extract(epoch from clock_timestamp()-started)*1000;
  insert into catalog_benchmark values(case_name,old_ms,new_ms,old_result=new_result);
  raise notice '%: old % ms, shared % ms, equal %',case_name,old_ms,new_ms,old_result=new_result;
  if old_result is distinct from new_result then raise exception 'Catalog comparison differs for %',case_name; end if;
end $$;
select pg_temp.compare_catalog_case('story','{"story_rich":3,"tactical":2}','{"horror":1}',6);
select pg_temp.compare_catalog_case('chill','{"chill":2}','{}',1);
select pg_temp.compare_catalog_case('cold_start','{}','{}',0);
table catalog_benchmark;
