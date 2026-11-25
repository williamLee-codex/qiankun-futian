begin;

create or replace function platform.settle_rpg_dun007_progress(
  p_character_id uuid,
  p_operation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level integer;
  v_checkpoint text;
  v_status text;
  v_dungeon_event_id uuid;
  v_main_event_id uuid;
  v_has_dungeon_clear boolean;
  v_has_main_complete boolean;
begin
  if p_character_id is null
     or p_operation_id is null
     or char_length(btrim(p_operation_id)) not between 1 and 128 then
    raise exception 'RPG_DUN007_INVALID_SETTLEMENT';
  end if;

  select c.level, mp.checkpoint_id, mp.status
    into v_level, v_checkpoint, v_status
  from platform.rpg_characters c
  join platform.rpg_character_main_progress mp
    on mp.character_id = c.id
  where c.id = p_character_id
  for update of c, mp;

  if not found then
    raise exception 'RPG_DUN007_PROGRESS_NOT_INITIALIZED';
  end if;

  select exists (
    select 1
    from platform.rpg_progress_events
    where character_id = p_character_id
      and event_key = 'dungeon-clear:DUN007:first'
  ) into v_has_dungeon_clear;

  select exists (
    select 1
    from platform.rpg_progress_events
    where character_id = p_character_id
      and event_key = 'main-progress:V1-L010:complete'
  ) into v_has_main_complete;

  if v_has_dungeon_clear and v_has_main_complete
     and v_checkpoint = 'V1-L011'
     and v_status = 'ACTIVE' then
    return jsonb_build_object(
      'resultStatus', 'duplicate',
      'characterId', p_character_id::text,
      'dungeonId', 'DUN007',
      'firstClear', false,
      'checkpointId', 'V1-L011',
      'status', 'ACTIVE'
    );
  end if;

  if v_level < 10 then
    raise exception 'RPG_DUN007_LEVEL_GATE';
  end if;

  if v_checkpoint <> 'V1-L010' or v_status <> 'ACTIVE' then
    raise exception 'RPG_DUN007_CHECKPOINT_GATE';
  end if;

  if v_has_dungeon_clear or v_has_main_complete then
    raise exception 'RPG_DUN007_PARTIAL_SETTLEMENT_STATE';
  end if;

  insert into platform.rpg_character_dungeon_clears (
    character_id,
    dungeon_id
  )
  values (
    p_character_id,
    'DUN007'
  )
  on conflict (character_id, dungeon_id) do nothing;

  if not found then
    raise exception 'RPG_DUN007_PARTIAL_SETTLEMENT_STATE';
  end if;

  insert into platform.rpg_progress_events (
    character_id,
    event_key,
    event_type,
    experience_delta,
    payload
  )
  values (
    p_character_id,
    'dungeon-clear:DUN007:first',
    'dungeon_first_clear',
    0,
    jsonb_build_object(
      'dungeonId', 'DUN007',
      'operationId', btrim(p_operation_id),
      'firstClear', true
    )
  )
  on conflict (character_id, event_key) do nothing
  returning id into v_dungeon_event_id;

  if v_dungeon_event_id is null then
    raise exception 'RPG_DUN007_DUNGEON_EVENT_CONFLICT';
  end if;

  insert into platform.rpg_progress_events (
    character_id,
    event_key,
    event_type,
    experience_delta,
    payload
  )
  values (
    p_character_id,
    'main-progress:V1-L010:complete',
    'main_checkpoint_complete',
    0,
    jsonb_build_object(
      'checkpointId', 'V1-L010',
      'operationId', btrim(p_operation_id),
      'sourceDungeonId', 'DUN007'
    )
  )
  on conflict (character_id, event_key) do nothing
  returning id into v_main_event_id;

  if v_main_event_id is null then
    raise exception 'RPG_DUN007_MAIN_EVENT_CONFLICT';
  end if;

  update platform.rpg_character_main_progress
    set checkpoint_id = 'V1-L011',
        status = 'ACTIVE',
        updated_at = now()
    where character_id = p_character_id
      and checkpoint_id = 'V1-L010'
      and status = 'ACTIVE';

  if not found then
    raise exception 'RPG_DUN007_CHECKPOINT_UPDATE_FAILED';
  end if;

  return jsonb_build_object(
    'resultStatus', 'created',
    'characterId', p_character_id::text,
    'dungeonId', 'DUN007',
    'firstClear', true,
    'checkpointId', 'V1-L011',
    'status', 'ACTIVE'
  );
end;
$$;

revoke all on function platform.settle_rpg_dun007_progress(uuid, text) from public;
revoke all on function platform.settle_rpg_dun007_progress(uuid, text) from anon, authenticated;
grant execute on function platform.settle_rpg_dun007_progress(uuid, text) to service_role;

comment on function platform.settle_rpg_dun007_progress(uuid, text) is
  'Atomic DUN007 first-clear and V1-L010 main-progress settlement. DUN007 balance rewards remain unresolved and are not granted here.';

commit;
