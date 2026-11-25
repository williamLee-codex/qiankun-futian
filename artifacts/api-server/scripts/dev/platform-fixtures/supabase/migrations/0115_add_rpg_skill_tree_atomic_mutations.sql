begin;

create table platform.rpg_skill_tree_operations (
  operation_id text primary key check (char_length(btrim(operation_id)) between 1 and 128),
  character_id uuid not null references platform.rpg_characters(id) on delete cascade,
  operation_type text not null check (operation_type in ('allocate', 'reset')),
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table platform.rpg_skill_tree_operations enable row level security;
revoke all on table platform.rpg_skill_tree_operations from anon, authenticated;

create or replace function platform.allocate_rpg_skill_tree_point(
  p_character_id uuid,
  p_node_id text,
  p_operation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_earned integer;
  v_allocated integer;
  v_rank integer;
  v_result jsonb;
begin
  if p_character_id is null or nullif(btrim(p_node_id), '') is null
     or nullif(btrim(p_operation_id), '') is null then
    raise exception 'RPG_SKILL_TREE_INVALID_REQUEST';
  end if;

  select result into v_result
  from platform.rpg_skill_tree_operations
  where operation_id = p_operation_id
    and character_id = p_character_id
    and operation_type = 'allocate';
  if found then return v_result; end if;

  select ordinary_skill_points_earned into v_earned
  from platform.rpg_character_skill_tree_state
  where character_id = p_character_id
  for update;
  if not found then raise exception 'RPG_SKILL_TREE_STATE_NOT_FOUND'; end if;

  select coalesce(sum(a.rank), 0)::integer into v_allocated
  from platform.rpg_character_skill_tree_allocations a
  where a.character_id = p_character_id;

  if v_allocated >= v_earned then
    raise exception 'RPG_SKILL_TREE_INSUFFICIENT_POINTS';
  end if;
  if v_allocated >= 600 then
    raise exception 'RPG_SKILL_TREE_GLOBAL_ALLOCATION_CAPPED';
  end if;

  insert into platform.rpg_character_skill_tree_allocations(character_id, node_id, rank, updated_at)
  values (p_character_id, btrim(p_node_id), 1, now())
  on conflict (character_id, node_id) do update
    set rank = platform.rpg_character_skill_tree_allocations.rank + 1,
        updated_at = now()
  returning rank into v_rank;

  v_allocated := v_allocated + 1;
  v_result := jsonb_build_object(
    'resultStatus', 'created',
    'characterId', p_character_id,
    'nodeId', btrim(p_node_id),
    'rank', v_rank,
    'spentPoints', v_allocated,
    'remainingPoints', v_earned - v_allocated
  );

  insert into platform.rpg_skill_tree_operations(operation_id, character_id, operation_type, result)
  values (btrim(p_operation_id), p_character_id, 'allocate', v_result);

  return v_result;
end;
$$;

create or replace function platform.reset_rpg_skill_tree(
  p_character_id uuid,
  p_operation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_earned integer;
  v_refunded integer;
  v_result jsonb;
begin
  if p_character_id is null or nullif(btrim(p_operation_id), '') is null then
    raise exception 'RPG_SKILL_TREE_INVALID_REQUEST';
  end if;

  select result into v_result
  from platform.rpg_skill_tree_operations
  where operation_id = p_operation_id
    and character_id = p_character_id
    and operation_type = 'reset';
  if found then return v_result; end if;

  select ordinary_skill_points_earned into v_earned
  from platform.rpg_character_skill_tree_state
  where character_id = p_character_id
  for update;
  if not found then raise exception 'RPG_SKILL_TREE_STATE_NOT_FOUND'; end if;

  select coalesce(sum(a.rank), 0)::integer into v_refunded
  from platform.rpg_character_skill_tree_allocations a
  where a.character_id = p_character_id;

  delete from platform.rpg_character_skill_tree_allocations
  where character_id = p_character_id;

  v_result := jsonb_build_object(
    'resultStatus', 'reset',
    'characterId', p_character_id,
    'refundedPoints', v_refunded,
    'remainingPoints', v_earned
  );

  insert into platform.rpg_skill_tree_operations(operation_id, character_id, operation_type, result)
  values (btrim(p_operation_id), p_character_id, 'reset', v_result);

  return v_result;
end;
$$;

revoke all on function platform.allocate_rpg_skill_tree_point(uuid, text, text) from public, anon, authenticated;
revoke all on function platform.reset_rpg_skill_tree(uuid, text) from public, anon, authenticated;
grant execute on function platform.allocate_rpg_skill_tree_point(uuid, text, text) to service_role;
grant execute on function platform.reset_rpg_skill_tree(uuid, text) to service_role;

comment on function platform.allocate_rpg_skill_tree_point(uuid, text, text) is
  'Trusted atomic persistence primitive. Caller must validate Master Data node/rank/edge/milestone/fusion/capstone rules before invoking.';
comment on function platform.reset_rpg_skill_tree(uuid, text) is
  'Trusted atomic reset primitive. Preserves earned skill points and clears allocations.';

commit;
