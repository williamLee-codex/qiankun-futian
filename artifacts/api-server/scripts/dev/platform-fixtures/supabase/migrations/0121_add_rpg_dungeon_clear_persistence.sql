begin;

create table platform.rpg_character_dungeon_clears (
  character_id uuid not null references platform.rpg_characters(id) on delete cascade,
  dungeon_id text not null,
  first_cleared_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (character_id, dungeon_id)
);

alter table platform.rpg_character_dungeon_clears enable row level security;

create policy "rpg dungeon clears own select"
on platform.rpg_character_dungeon_clears
for select
to authenticated
using (
  exists (
    select 1
    from platform.rpg_characters c
    join platform.rpg_players p on p.id = c.player_id
    where c.id = rpg_character_dungeon_clears.character_id
      and p.user_id = (select auth.uid())
  )
);

create or replace function platform.settle_rpg_dungeon_clear(
  p_character_id uuid,
  p_dungeon_id text,
  p_operation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_event_key text;
  v_first_clear boolean := false;
begin
  if p_character_id is null
     or p_dungeon_id is null
     or char_length(btrim(p_dungeon_id)) not between 1 and 64
     or p_operation_id is null
     or char_length(btrim(p_operation_id)) not between 1 and 128 then
    raise exception 'RPG_DUNGEON_CLEAR_INVALID_SETTLEMENT';
  end if;

  perform 1
  from platform.rpg_characters
  where id = p_character_id
  for update;

  if not found then
    raise exception 'RPG_DUNGEON_CLEAR_CHARACTER_NOT_FOUND';
  end if;

  v_event_key := 'dungeon-clear:' || btrim(p_dungeon_id) || ':first';

  perform 1
  from platform.rpg_progress_events
  where character_id = p_character_id
    and event_key = v_event_key;

  if found then
    return jsonb_build_object(
      'resultStatus', 'duplicate',
      'characterId', p_character_id::text,
      'dungeonId', btrim(p_dungeon_id),
      'firstClear', false
    );
  end if;

  insert into platform.rpg_character_dungeon_clears (
    character_id,
    dungeon_id
  )
  values (
    p_character_id,
    btrim(p_dungeon_id)
  )
  on conflict (character_id, dungeon_id) do nothing;

  if found then
    v_first_clear := true;
  end if;

  if not v_first_clear then
    return jsonb_build_object(
      'resultStatus', 'duplicate',
      'characterId', p_character_id::text,
      'dungeonId', btrim(p_dungeon_id),
      'firstClear', false
    );
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
    'dungeon_first_clear',
    0,
    jsonb_build_object(
      'dungeonId', btrim(p_dungeon_id),
      'operationId', btrim(p_operation_id),
      'firstClear', true
    )
  )
  on conflict (character_id, event_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    raise exception 'RPG_DUNGEON_CLEAR_EVENT_CONFLICT';
  end if;

  return jsonb_build_object(
    'resultStatus', 'created',
    'characterId', p_character_id::text,
    'dungeonId', btrim(p_dungeon_id),
    'firstClear', true
  );
end;
$$;

revoke all on function platform.settle_rpg_dungeon_clear(uuid, text, text) from public;
revoke all on function platform.settle_rpg_dungeon_clear(uuid, text, text) from anon, authenticated;
grant execute on function platform.settle_rpg_dungeon_clear(uuid, text, text) to service_role;

comment on function platform.settle_rpg_dungeon_clear(uuid, text, text) is
  'Trusted RPG server settlement for authoritative dungeon first-clear persistence. No unresolved dungeon rewards are granted here.';

commit;
