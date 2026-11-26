begin;

alter table platform.rpg_players
  alter column user_id drop not null;

alter table platform.rpg_players
  add column if not exists actor_type text not null default 'HUMAN',
  add column if not exists server_id text not null default 'S1';

alter table platform.rpg_characters
  add constraint rpg_characters_player_id_id_unique
  unique (player_id, id);

alter table platform.rpg_players
  add constraint rpg_players_actor_type_check
  check (actor_type in ('HUMAN', 'SYNTHETIC'));

alter table platform.rpg_players
  add constraint rpg_players_actor_identity_check
  check (
    (actor_type = 'HUMAN' and user_id is not null)
    or (actor_type = 'SYNTHETIC' and user_id is null)
  );

alter table platform.rpg_players
  add constraint rpg_players_id_server_unique
  unique (id, server_id);

create table platform.rpg_synthetic_registry (
  synthetic_id uuid primary key default gen_random_uuid(),
  rpg_player_id uuid not null unique
    references platform.rpg_players(id) on delete cascade,
  rpg_character_id uuid not null,
  server_id text not null,
  status text not null default 'INACTIVE'
    check (status in ('ACTIVE', 'INACTIVE')),
  behavior_profile jsonb not null default '{}'::jsonb,
  runtime_status text not null default 'NORMAL'
    check (runtime_status in ('NORMAL', 'ERROR')),
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rpg_synthetic_registry_player_character_match
    foreign key (rpg_player_id, rpg_character_id)
    references platform.rpg_characters(player_id, id),
  constraint rpg_synthetic_registry_server_match
    foreign key (rpg_player_id, server_id)
    references platform.rpg_players(id, server_id)
);

alter table platform.rpg_synthetic_registry enable row level security;

revoke all on table platform.rpg_synthetic_registry from anon, authenticated;
grant all on table platform.rpg_synthetic_registry to service_role;

create or replace function platform.assert_synthetic_server_capacity(
  p_server_id text,
  p_requested_count integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_count integer;
  v_locked_id uuid;
begin
  if p_server_id is null
     or p_requested_count is null
     or p_requested_count <= 0 then
    raise exception 'RPG_SYNTHETIC_INVALID_BATCH';
  end if;

  lock table platform.rpg_synthetic_registry in share row exclusive mode;

  select count(*)::integer
    into v_existing_count
  from platform.rpg_synthetic_registry
  where server_id = p_server_id;

  select synthetic_id
    into v_locked_id
  from platform.rpg_synthetic_registry
  where server_id = p_server_id
  limit 1
  for update;

  if v_existing_count + p_requested_count > 399 then
    raise exception 'RPG_SYNTHETIC_SERVER_CAPACITY_EXCEEDED';
  end if;
end;
$$;

revoke all on function platform.assert_synthetic_server_capacity(text, integer)
  from public, anon, authenticated;

grant execute on function platform.assert_synthetic_server_capacity(text, integer)
  to service_role;

commit;


