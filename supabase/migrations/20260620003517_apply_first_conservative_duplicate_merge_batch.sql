-- Apply the first conservative duplicate merge batch after Playfit-owned ID cleanup.
-- Scope: 50 fixed, simple 1:1 groups from the current review queue.
begin;

do $$
declare
  v_existing_approved int := 0;
  v_groups_present int := 0;
  v_merged_groups int := 0;
  v_safe_groups int := 0;
  v_remaining_loser_redirects int := 0;
  v_result record;
begin
  with chosen(group_key) as (
    values
      ('abunaikoinosousashitsu'),
      ('acealiencleanupelite'),
      ('aerowings2airstrike'),
      ('alienzombiemegadeath'),
      ('anokowaorekarahanarenai'),
      ('backtrack'),
      ('battletank'),
      ('bdamanbakugaidenvfinalmegatune'),
      ('bdamanbakugaidenvictoryenomichi'),
      ('biosenshidanincreasertonotatakai'),
      ('blastworksbuildtradedestroy'),
      ('blazblueclonephantasma'),
      ('bookyman'),
      ('buzzjuniorrobojam'),
      ('cabelasdangeroushunts2009'),
      ('caesarspalace2000'),
      ('carnivalgamesminigolf'),
      ('carstoonmaterstalltales'),
      ('conceptionorenokodomowoundekure'),
      ('cuphead'),
      ('daisenryakudaitouakouboushitoratoratorawarekishuuniseikouseri'),
      ('dariusburst'),
      ('darkestdungeon'),
      ('dawnofdiscovery'),
      ('deadbolt'),
      ('deadbydaylight'),
      ('deadspace2'),
      ('deblob2'),
      ('defendindepenguin'),
      ('devicereign'),
      ('dishonored'),
      ('dishonored2'),
      ('dontstarve'),
      ('doraemonshinnobitanonihontanjou'),
      ('downwell'),
      ('dragonageorigins'),
      ('dragonageoriginsultimateedition'),
      ('dragonballevolution'),
      ('dragonballzgaidensaiyajinzetsumetsukeikaku'),
      ('dragonseeds'),
      ('duckgame'),
      ('dusk'),
      ('dyinglight'),
      ('dynastywarriors9'),
      ('espnspeedworld'),
      ('ettheextraterrestrial'),
      ('ever17theoutofinfinity'),
      ('excalibur2555ad'),
      ('eyetoyplay'),
      ('f1race')
  )
  select
    count(*)::int,
    count(*) filter (where g.status = 'merged')::int
  into v_groups_present, v_merged_groups
  from chosen c
  join games_library.game_duplicate_groups g on g.group_key = c.group_key;

  if v_groups_present = 0 then
    raise notice 'Conservative duplicate merge batch skipped: selected groups are absent.';
    return;
  end if;

  if v_groups_present = 50 and v_merged_groups = 50 then
    raise notice 'Conservative duplicate merge batch skipped: selected groups are already merged.';
    return;
  end if;

  if v_groups_present <> 50 then
    raise exception 'Expected 50 selected duplicate groups, found %', v_groups_present;
  end if;

  if v_merged_groups <> 0 then
    raise exception 'Selected duplicate groups are partially merged: % already merged', v_merged_groups;
  end if;

  select count(*)::int
  into v_existing_approved
  from games_library.game_duplicate_groups
  where status = 'approved';

  if v_existing_approved <> 0 then
    raise exception 'Expected 0 pre-existing approved duplicate groups, found %', v_existing_approved;
  end if;

  with chosen(group_key) as (
    values
      ('abunaikoinosousashitsu'),
      ('acealiencleanupelite'),
      ('aerowings2airstrike'),
      ('alienzombiemegadeath'),
      ('anokowaorekarahanarenai'),
      ('backtrack'),
      ('battletank'),
      ('bdamanbakugaidenvfinalmegatune'),
      ('bdamanbakugaidenvictoryenomichi'),
      ('biosenshidanincreasertonotatakai'),
      ('blastworksbuildtradedestroy'),
      ('blazblueclonephantasma'),
      ('bookyman'),
      ('buzzjuniorrobojam'),
      ('cabelasdangeroushunts2009'),
      ('caesarspalace2000'),
      ('carnivalgamesminigolf'),
      ('carstoonmaterstalltales'),
      ('conceptionorenokodomowoundekure'),
      ('cuphead'),
      ('daisenryakudaitouakouboushitoratoratorawarekishuuniseikouseri'),
      ('dariusburst'),
      ('darkestdungeon'),
      ('dawnofdiscovery'),
      ('deadbolt'),
      ('deadbydaylight'),
      ('deadspace2'),
      ('deblob2'),
      ('defendindepenguin'),
      ('devicereign'),
      ('dishonored'),
      ('dishonored2'),
      ('dontstarve'),
      ('doraemonshinnobitanonihontanjou'),
      ('downwell'),
      ('dragonageorigins'),
      ('dragonageoriginsultimateedition'),
      ('dragonballevolution'),
      ('dragonballzgaidensaiyajinzetsumetsukeikaku'),
      ('dragonseeds'),
      ('duckgame'),
      ('dusk'),
      ('dyinglight'),
      ('dynastywarriors9'),
      ('espnspeedworld'),
      ('ettheextraterrestrial'),
      ('ever17theoutofinfinity'),
      ('excalibur2555ad'),
      ('eyetoyplay'),
      ('f1race')
  ),
  group_checks as (
    select
      p.group_key,
      count(*) as plan_rows,
      count(*) filter (where p.recommended_action = 'keep') as keep_rows,
      count(*) filter (where p.recommended_action = 'merge_into_winner') as merge_rows,
      bool_and(p.group_status = 'needs_review') as all_needs_review,
      bool_and(p.review_bucket = 'auto_proposable_same_title_year') as all_auto,
      bool_and(p.proposed_action = p.recommended_action) as all_actions_match,
      bool_and(p.group_user_ref_count = 0) as no_user_refs,
      bool_and(not p.group_has_edition_keyword) as no_edition_keywords,
      bool_and(p.known_year_count = 1) as one_known_year
    from chosen c
    join games_library.game_duplicate_review_plan p on p.group_key = c.group_key
    group by p.group_key
  )
  select count(*)::int
  into v_safe_groups
  from group_checks
  where plan_rows = 2
    and keep_rows = 1
    and merge_rows = 1
    and all_needs_review
    and all_auto
    and all_actions_match
    and no_user_refs
    and no_edition_keywords
    and one_known_year;

  if v_safe_groups <> 50 then
    raise exception 'Expected 50 safe duplicate groups, found %', v_safe_groups;
  end if;

  with chosen(group_key) as (
    values
      ('abunaikoinosousashitsu'),
      ('acealiencleanupelite'),
      ('aerowings2airstrike'),
      ('alienzombiemegadeath'),
      ('anokowaorekarahanarenai'),
      ('backtrack'),
      ('battletank'),
      ('bdamanbakugaidenvfinalmegatune'),
      ('bdamanbakugaidenvictoryenomichi'),
      ('biosenshidanincreasertonotatakai'),
      ('blastworksbuildtradedestroy'),
      ('blazblueclonephantasma'),
      ('bookyman'),
      ('buzzjuniorrobojam'),
      ('cabelasdangeroushunts2009'),
      ('caesarspalace2000'),
      ('carnivalgamesminigolf'),
      ('carstoonmaterstalltales'),
      ('conceptionorenokodomowoundekure'),
      ('cuphead'),
      ('daisenryakudaitouakouboushitoratoratorawarekishuuniseikouseri'),
      ('dariusburst'),
      ('darkestdungeon'),
      ('dawnofdiscovery'),
      ('deadbolt'),
      ('deadbydaylight'),
      ('deadspace2'),
      ('deblob2'),
      ('defendindepenguin'),
      ('devicereign'),
      ('dishonored'),
      ('dishonored2'),
      ('dontstarve'),
      ('doraemonshinnobitanonihontanjou'),
      ('downwell'),
      ('dragonageorigins'),
      ('dragonageoriginsultimateedition'),
      ('dragonballevolution'),
      ('dragonballzgaidensaiyajinzetsumetsukeikaku'),
      ('dragonseeds'),
      ('duckgame'),
      ('dusk'),
      ('dyinglight'),
      ('dynastywarriors9'),
      ('espnspeedworld'),
      ('ettheextraterrestrial'),
      ('ever17theoutofinfinity'),
      ('excalibur2555ad'),
      ('eyetoyplay'),
      ('f1race')
  )
  update games_library.game_duplicate_groups g
  set
    status = 'approved',
    reviewed_by = 'migration_20260620003517',
    reviewed_at = now(),
    review_notes = case
      when btrim(coalesce(g.review_notes, '')) = '' then 'Approved first conservative duplicate merge batch of 50 after Playfit-owned ID cleanup.'
      else g.review_notes || E'\nApproved first conservative duplicate merge batch of 50 after Playfit-owned ID cleanup.'
    end,
    updated_at = now()
  from chosen c
  where g.group_key = c.group_key;

  with chosen(group_key) as (
    values
      ('abunaikoinosousashitsu'),
      ('acealiencleanupelite'),
      ('aerowings2airstrike'),
      ('alienzombiemegadeath'),
      ('anokowaorekarahanarenai'),
      ('backtrack'),
      ('battletank'),
      ('bdamanbakugaidenvfinalmegatune'),
      ('bdamanbakugaidenvictoryenomichi'),
      ('biosenshidanincreasertonotatakai'),
      ('blastworksbuildtradedestroy'),
      ('blazblueclonephantasma'),
      ('bookyman'),
      ('buzzjuniorrobojam'),
      ('cabelasdangeroushunts2009'),
      ('caesarspalace2000'),
      ('carnivalgamesminigolf'),
      ('carstoonmaterstalltales'),
      ('conceptionorenokodomowoundekure'),
      ('cuphead'),
      ('daisenryakudaitouakouboushitoratoratorawarekishuuniseikouseri'),
      ('dariusburst'),
      ('darkestdungeon'),
      ('dawnofdiscovery'),
      ('deadbolt'),
      ('deadbydaylight'),
      ('deadspace2'),
      ('deblob2'),
      ('defendindepenguin'),
      ('devicereign'),
      ('dishonored'),
      ('dishonored2'),
      ('dontstarve'),
      ('doraemonshinnobitanonihontanjou'),
      ('downwell'),
      ('dragonageorigins'),
      ('dragonageoriginsultimateedition'),
      ('dragonballevolution'),
      ('dragonballzgaidensaiyajinzetsumetsukeikaku'),
      ('dragonseeds'),
      ('duckgame'),
      ('dusk'),
      ('dyinglight'),
      ('dynastywarriors9'),
      ('espnspeedworld'),
      ('ettheextraterrestrial'),
      ('ever17theoutofinfinity'),
      ('excalibur2555ad'),
      ('eyetoyplay'),
      ('f1race')
  ),
  merge_pairs as (
    select
      p.group_key,
      p.game_id as loser_game_id,
      p.winner_game_id
    from chosen c
    join games_library.game_duplicate_candidates p on p.group_key = c.group_key
    where p.proposed_action = 'merge_into_winner'
  ),
  deleted_self_redirects as (
    delete from games_library.game_redirects r
    using merge_pairs p
    where r.to_game_id = p.loser_game_id
      and r.from_game_id = p.winner_game_id
    returning 1
  )
  update games_library.game_redirects r
  set
    to_game_id = p.winner_game_id,
    notes = case
      when btrim(coalesce(r.notes, '')) = '' then 'Redirect retargeted before duplicate merge from ' || p.loser_game_id
      else r.notes || E'\nRedirect retargeted before duplicate merge from ' || p.loser_game_id
    end,
    updated_at = now()
  from merge_pairs p
  where r.to_game_id = p.loser_game_id
    and r.from_game_id <> p.winner_game_id;

  with chosen(group_key) as (
    values
      ('abunaikoinosousashitsu'),
      ('acealiencleanupelite'),
      ('aerowings2airstrike'),
      ('alienzombiemegadeath'),
      ('anokowaorekarahanarenai'),
      ('backtrack'),
      ('battletank'),
      ('bdamanbakugaidenvfinalmegatune'),
      ('bdamanbakugaidenvictoryenomichi'),
      ('biosenshidanincreasertonotatakai'),
      ('blastworksbuildtradedestroy'),
      ('blazblueclonephantasma'),
      ('bookyman'),
      ('buzzjuniorrobojam'),
      ('cabelasdangeroushunts2009'),
      ('caesarspalace2000'),
      ('carnivalgamesminigolf'),
      ('carstoonmaterstalltales'),
      ('conceptionorenokodomowoundekure'),
      ('cuphead'),
      ('daisenryakudaitouakouboushitoratoratorawarekishuuniseikouseri'),
      ('dariusburst'),
      ('darkestdungeon'),
      ('dawnofdiscovery'),
      ('deadbolt'),
      ('deadbydaylight'),
      ('deadspace2'),
      ('deblob2'),
      ('defendindepenguin'),
      ('devicereign'),
      ('dishonored'),
      ('dishonored2'),
      ('dontstarve'),
      ('doraemonshinnobitanonihontanjou'),
      ('downwell'),
      ('dragonageorigins'),
      ('dragonageoriginsultimateedition'),
      ('dragonballevolution'),
      ('dragonballzgaidensaiyajinzetsumetsukeikaku'),
      ('dragonseeds'),
      ('duckgame'),
      ('dusk'),
      ('dyinglight'),
      ('dynastywarriors9'),
      ('espnspeedworld'),
      ('ettheextraterrestrial'),
      ('ever17theoutofinfinity'),
      ('excalibur2555ad'),
      ('eyetoyplay'),
      ('f1race')
  ),
  merge_pairs as (
    select p.game_id as loser_game_id
    from chosen c
    join games_library.game_duplicate_candidates p on p.group_key = c.group_key
    where p.proposed_action = 'merge_into_winner'
  )
  select count(*)::int
  into v_remaining_loser_redirects
  from games_library.game_redirects r
  join merge_pairs p on p.loser_game_id = r.to_game_id;

  if v_remaining_loser_redirects <> 0 then
    raise exception 'Expected 0 redirects pointing at loser games before merge, found %', v_remaining_loser_redirects;
  end if;

  select *
  into v_result
  from games_library_private.apply_approved_game_duplicate_merges(50);

  if v_result.groups_processed <> 50
     or v_result.games_retired <> 50
     or v_result.redirects_created <> 50 then
    raise exception 'Unexpected conservative merge result: groups %, retired %, redirects %',
      v_result.groups_processed,
      v_result.games_retired,
      v_result.redirects_created;
  end if;
end;
$$;

commit;

-- Down:
-- This batch is intentionally not auto-reversed. The merge executor stores
-- snapshots in games_library_private.game_duplicate_merge_items and redirects
-- in games_library.game_redirects for inspected rollback if needed.
