begin;

alter table games_library.tag_weights enable row level security;

drop policy if exists public_read_tag_weights on games_library.tag_weights;
create policy public_read_tag_weights
  on games_library.tag_weights
  for select
  to anon, authenticated
  using (true);

alter function games_library.weighted_cosine_similarity(text[], jsonb, double precision)
  set search_path = pg_catalog;
alter function games_library.weighted_cosine_similarity(text[], jsonb, double precision)
  stable;
alter function games_library.refresh_tag_weights()
  set search_path = pg_catalog;
alter function games_library.tag_weight(text)
  set search_path = pg_catalog;
alter function games_library.tag_set_norm(jsonb)
  set search_path = pg_catalog;
alter function games_library.tag_set_norm(jsonb)
  stable;

commit;

-- Down:
-- alter table games_library.tag_weights disable row level security;
-- drop policy if exists public_read_tag_weights on games_library.tag_weights;
-- alter function games_library.weighted_cosine_similarity(text[], jsonb, double precision) reset search_path;
-- alter function games_library.weighted_cosine_similarity(text[], jsonb, double precision) immutable;
-- alter function games_library.refresh_tag_weights() reset search_path;
-- alter function games_library.tag_weight(text) reset search_path;
-- alter function games_library.tag_set_norm(jsonb) reset search_path;
-- alter function games_library.tag_set_norm(jsonb) immutable;
