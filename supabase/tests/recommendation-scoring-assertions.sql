create temp table review_profiles(liked jsonb, disliked jsonb, rated integer, states jsonb);
insert into review_profiles values
  ('{}','{}',0,'{}'),
  ('{"story_rich":3,"tactical":2}','{"horror":1}',6,'{}'),
  ('{"chill":2}','{}',1,'{}'),
  ('{}','{"souls_like":2,"demanding":1}',3,'{}'),
  ('{"story_rich":2}','{}',6,'{"story":{"inPlayfitPicks":true}}'),
  ('{"story_rich":2}','{}',6,'{"story":{"status":"completed","excluded":true}}');
do $$
declare p record; before_model jsonb; after_model jsonb; entry jsonb; detail jsonb;
begin
  for p in select * from review_profiles loop
    before_model := pg_temp.previous_score_today_recommendations(p.liked,p.disliked,'{rpg}','{horror}',p.rated,'{pc}','{}','{}',p.states);
    after_model := games_library.score_today_recommendations(p.liked,p.disliked,'{rpg}','{horror}',p.rated,'{pc}','{}','{}',p.states);
    if before_model <> after_model then raise exception 'Discovery output changed: %, %',before_model,after_model; end if;
    for entry in select value from jsonb_array_elements(after_model->'nextUp') loop
      detail := games_library.score_recommendation_games(p.liked,p.disliked,'{rpg}','{horror}',p.rated,'{pc}',p.states,array[entry->'game'->>'gameId'])->0;
      if detail is null or detail->'affinityScore' <> entry->'affinityScore' or detail->'riskScore' <> entry->'riskScore' or detail->'confidence' <> entry->'confidence' then
        raise exception 'Cross-surface scoring mismatch';
      end if;
    end loop;
  end loop;
  detail := games_library.score_recommendation_games('{"chill":1}','{}','{}','{}',6,'{pc}','{"story":{"inPlayfitPicks":true}}','{story}')->0;
  if detail is null or detail->'inPlayfitPicks' <> 'true'::jsonb then raise exception 'Unrelated saved pick lost'; end if;
  detail := games_library.score_recommendation_games('{}','{}','{}','{}',0,'{pc}','{}','{future}')->0;
  if detail->>'accessStatus' <> 'unreleased' then raise exception 'Release eligibility lost'; end if;
  detail := games_library.score_recommendation_games('{}','{}','{}','{}',0,'{pc}','{}','{elsewhere}')->0;
  if detail->>'accessStatus' <> 'not_on_platforms' then raise exception 'Platform eligibility lost'; end if;
  raise notice 'PASS: six profiles, discovery parity, detail score parity, saved picks and eligibility';
end $$;
set local role anon;
select jsonb_array_length(games_library.score_recommendation_games('{}','{}','{}','{}',0,'{}','{}','{}')) as empty_batch;
reset role;
do $$
begin
  begin
    perform games_library.score_recommendation_games('{}','{}','{}','{}',0,'{}','{}',null);
    raise exception 'Null batch unexpectedly accepted' using errcode = '22000';
  exception when raise_exception then null;
  end;
  begin
    perform games_library.score_recommendation_games('{}','{}','{}','{}',0,'{}','{}',array_fill('story'::text,array[101]));
    raise exception 'Oversized batch unexpectedly accepted' using errcode = '22000';
  exception when raise_exception then null;
  end;
end $$;
