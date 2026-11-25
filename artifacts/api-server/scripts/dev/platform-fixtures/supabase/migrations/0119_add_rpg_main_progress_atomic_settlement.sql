begin;

create or replace function platform.settle_rpg_main_checkpoint(
  p_character_id uuid,
  p_checkpoint_id text,
  p_operation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level integer;
  v_current_checkpoint text;
  v_current_status text;
  v_checkpoint_level integer;
  v_next_checkpoint text;
  v_event_id uuid;
  v_event_key text;
begin
  if p_character_id is null
     or p_checkpoint_id is null
     or p_checkpoint_id !~ '^V1-L[0-9]{3}$'
     or substring(p_checkpoint_id from 5 for 3)::integer not between 1 and 100
     or p_operation_id is null
     or char_length(btrim(p_operation_id)) not between 1 and 128 then
    raise exception 'RPG_MAIN_PROGRESS_INVALID_SETTLEMENT';
  end if;

  select c.level, mp.checkpoint_id, mp.status
    into v_level, v_current_checkpoint, v_current_status
  from platform.rpg_characters c
  join platform.rpg_character_main_progress mp
    on mp.character_id = c.id
  where c.id = p_character_id
  for update of c, mp;

  if not found then
    raise exception 'RPG_MAIN_PROGRESS_NOT_INITIALIZED';
  end if;

  v_event_key := 'main-progress:' || p_checkpoint_id || ':complete';

  perform 1
  from platform.rpg_progress_events
  where character_id = p_character_id
    and event_key = v_event_key;

  if found then
    return jsonb_build_object(
      'resultStatus', 'duplicate',
      'characterId', p_character_id::text,
      'checkpointId', v_current_checkpoint,
      'status', v_current_status
    );
  end if;

  if v_current_status = 'COMPLETED' then
    raise exception 'RPG_MAIN_PROGRESS_ALREADY_COMPLETED';
  end if;

  if v_current_checkpoint <> p_checkpoint_id then
    raise exception 'RPG_MAIN_PROGRESS_CHECKPOINT_MISMATCH';
  end if;

  v_checkpoint_level := substring(p_checkpoint_id from 5 for 3)::integer;
  if v_level < v_checkpoint_level then
    raise exception 'RPG_MAIN_PROGRESS_LEVEL_GATE';
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
    v_event_key,
    'main_checkpoint_complete',
    0,
    jsonb_build_object(
      'checkpointId', p_checkpoint_id,
      'operationId', btrim(p_operation_id)
    )
  )
  on conflict (character_id, event_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return jsonb_build_object(
      'resultStatus', 'duplicate',
      'characterId', p_character_id::text,
      'checkpointId', v_current_checkpoint,
      'status', v_current_status
    );
  end if;

  if p_checkpoint_id = 'V1-L100' then
    update platform.rpg_character_main_progress
      set status = 'COMPLETED',
          updated_at = now()
      where character_id = p_character_id;

    return jsonb_build_object(
      'resultStatus', 'created',
      'characterId', p_character_id::text,
      'checkpointId', 'V1-L100',
      'status', 'COMPLETED'
    );
  end if;

  v_next_checkpoint :=
    'V1-L' || lpad((v_checkpoint_level + 1)::text, 3, '0');

  update platform.rpg_character_main_progress
    set checkpoint_id = v_next_checkpoint,
        status = 'ACTIVE',
        updated_at = now()
    where character_id = p_character_id;

  return jsonb_build_object(
    'resultStatus', 'created',
    'characterId', p_character_id::text,
    'checkpointId', v_next_checkpoint,
    'status', 'ACTIVE'
  );
end;
$$;

revoke all on function platform.settle_rpg_main_checkpoint(uuid, text, text) from public;
revoke all on function platform.settle_rpg_main_checkpoint(uuid, text, text) from anon, authenticated;
grant execute on function platform.settle_rpg_main_checkpoint(uuid, text, text) to service_role;

comment on function platform.settle_rpg_main_checkpoint(uuid, text, text) is
  'Trusted RPG server settlement for V1 main progression checkpoints. P0 records completion and advances materialized state only; it does not award EXP or economy rewards.';

commit;
