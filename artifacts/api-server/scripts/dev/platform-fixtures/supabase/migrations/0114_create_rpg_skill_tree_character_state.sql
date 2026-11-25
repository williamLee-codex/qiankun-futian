begin;

create table platform.rpg_character_skill_tree_state (
  character_id uuid primary key references platform.rpg_characters(id) on delete cascade,
  ordinary_skill_points_earned integer not null default 0
    check (ordinary_skill_points_earned between 0 and 600),
  updated_at timestamptz not null default now()
);

create table platform.rpg_character_skill_tree_allocations (
  character_id uuid not null references platform.rpg_characters(id) on delete cascade,
  node_id text not null check (char_length(btrim(node_id)) between 1 and 64),
  rank integer not null check (rank >= 1),
  updated_at timestamptz not null default now(),
  primary key (character_id, node_id)
);

create index rpg_character_skill_tree_allocations_character_idx
  on platform.rpg_character_skill_tree_allocations(character_id);

insert into platform.rpg_character_skill_tree_state (
  character_id,
  ordinary_skill_points_earned
)
select
  c.id,
  least(c.level, 600)
from platform.rpg_characters c
on conflict (character_id) do nothing;

alter table platform.rpg_character_skill_tree_state enable row level security;
alter table platform.rpg_character_skill_tree_allocations enable row level security;

revoke all on table platform.rpg_character_skill_tree_state from anon, authenticated;
revoke all on table platform.rpg_character_skill_tree_allocations from anon, authenticated;

grant select on table platform.rpg_character_skill_tree_state to authenticated;
grant select on table platform.rpg_character_skill_tree_allocations to authenticated;

create policy rpg_character_skill_tree_state_owner_select
  on platform.rpg_character_skill_tree_state
  for select
  to authenticated
  using (
    exists (
      select 1
      from platform.rpg_characters c
      join platform.rpg_players p on p.id = c.player_id
      where c.id = character_id
        and p.user_id = (select auth.uid())
    )
  );

create policy rpg_character_skill_tree_allocations_owner_select
  on platform.rpg_character_skill_tree_allocations
  for select
  to authenticated
  using (
    exists (
      select 1
      from platform.rpg_characters c
      join platform.rpg_players p on p.id = c.player_id
      where c.id = character_id
        and p.user_id = (select auth.uid())
    )
  );

comment on table platform.rpg_character_skill_tree_state is
  'Character-scoped ordinary skill point ledger. Allocation mutation remains behind a trusted atomic boundary.';

comment on table platform.rpg_character_skill_tree_allocations is
  'Character-scoped RPG universal skill-tree node ranks. Master node definitions remain versioned outside character state.';

commit;
