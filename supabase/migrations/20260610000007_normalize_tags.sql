begin;

-- Fase 3: Normalizar tags → tabla tags + game_tags (Opción B)
-- Se mantiene games.tags text[] como columna denormalizada durante la transición

create table if not exists games_library.tags (
  id text primary key
);

comment on table games_library.tags is 'Controlled vocabulary of gameplay/style tags';

-- Poblar desde los 144 tags definidos en el código
insert into games_library.tags (id)
select unnest(array[
  'story_rich', 'lore_heavy', 'minimalist_story', 'branching_narrative', 'emergent_narrative',
  'text_based', 'turn_based', 'real_time', 'stealth', 'puzzle', 'rhythm', 'souls_like',
  'platformer', 'shooter', 'hack_and_slash', 'tactical', 'deck_building', 'survival',
  'crafting', 'base_building', 'farming', 'racing', 'fighting', 'bullet_hell', 'exploration',
  'parkour', 'immersive_sim', 'social_deduction', 'open_world', 'linear', 'hub_based',
  'mission_based', 'roguelike', 'metroidvania', 'sandbox', 'procedural', 'episodic',
  'horde_mode', 'kingdom_building', 'dungeon_crawler', 'single_player', 'co_op',
  'competitive_multiplayer', 'local_multiplayer', 'online_multiplayer', 'asynchronous_multiplayer',
  'mmo', 'cross_platform', 'dark', 'lighthearted', 'whimsical', 'grounded', 'satirical',
  'comedy', 'melancholic', 'hopeful', 'cozy', 'surreal', 'demanding', 'challenging',
  'accessible', 'adaptive_difficulty', 'unforgiving', 'chill', 'practice_required',
  'easy_mode_available', 'short_sessions', 'medium_sessions', 'long_sessions',
  'pick_up_and_play', 'marathon', 'save_anywhere', 'pixel_art', 'realism', 'cel_shaded',
  'hand_drawn', 'low_poly', 'voxel', 'vector_art', '3d_cg', 'photorealistic', 'minimalist_art',
  'cinematic', 'aaa', 'aa', 'indie', 'experimental', 'aaa_adjacent', 'retro_revival',
  'fantasy', 'sci_fi', 'historical', 'modern', 'post_apocalyptic', 'horror', 'cyberpunk',
  'western', 'mythological', 'steampunk', 'lovecraftian', 'prehistoric', 'noir',
  'melee_focused', 'ranged_focused', 'tactical_combat', 'real_time_combat', 'turn_based_combat',
  'action_combat', 'no_combat', 'bullet_hell_combat', 'stealth_combat', 'rhythm_combat',
  'dodge_and_parry', 'first_person', 'third_person', 'top_down', 'side_scroller', 'isometric',
  'first_person_3d', 'third_person_3d', '2d_flat', '2_5d', 'vr',
  'under_5h', '5_10h', '10_30h', '30_60h', '60_100h', '100h_plus', 'endless',
  'great_soundtrack', 'atmospheric_audio', 'voice_acted', 'minimalist_audio', 'chiptune',
  'high_replayability', 'new_game_plus', 'post_game_content', 'moddable',
  'achievement_hunting', 'speedrun_friendly', 'multiple_endings'
])
on conflict (id) do nothing;

create table if not exists games_library.game_tags (
  game_id text not null references games_library.games(game_id) on delete cascade,
  tag_id  text not null references games_library.tags(id),
  primary key (game_id, tag_id)
);

create index if not exists game_tags_game_idx on games_library.game_tags (game_id);
create index if not exists game_tags_tag_idx  on games_library.game_tags (tag_id);

comment on table games_library.game_tags is 'Many-to-many join: which tags apply to which games';
comment on column games_library.game_tags.game_id is 'FK to games table';
comment on column games_library.game_tags.tag_id is 'FK to tags table';

-- Migrar datos existentes desde games.tags array
insert into games_library.game_tags (game_id, tag_id)
select g.game_id, unnest(g.tags)
from games_library.games g
where array_length(g.tags, 1) > 0
on conflict (game_id, tag_id) do nothing;

commit;
