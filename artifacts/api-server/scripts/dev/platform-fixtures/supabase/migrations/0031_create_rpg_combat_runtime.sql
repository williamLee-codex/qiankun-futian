begin;

-- DUN009 settlement is now reachable only through the persisted combat victory path.
revoke execute on function platform.settle_rpg_g02_trial(text) from authenticated, service_role;

create table platform.rpg_combat_encounters (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references platform.rpg_characters(id) on delete cascade,
  event_key text not null check (char_length(btrim(event_key)) between 1 and 128),
  dungeon_id text not null check (dungeon_id = 'DUN009'),
  status text not null default 'active' check (status in ('active', 'victory', 'defeat')),
  wave_index integer not null default 0 check (wave_index between 0 and 2),
  turn_number integer not null default 0 check (turn_number >= 0),
  player_hp integer not null check (player_hp >= 0),
  player_max_hp integer not null check (player_max_hp > 0 and player_hp <= player_max_hp),
  enemy_id text not null check (enemy_id in ('MON031', 'MON032')),
  enemy_hp integer not null check (enemy_hp >= 0),
  enemy_max_hp integer not null check (enemy_max_hp > 0 and enemy_hp <= enemy_max_hp),
  experience_awarded bigint not null default 0 check (experience_awarded = 0),
  drops_awarded jsonb not null default '[]'::jsonb
    check (drops_awarded = '[]'::jsonb),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (character_id, event_key)
);

create table platform.rpg_combat_commands (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references platform.rpg_combat_encounters(id) on delete cascade,
  event_key text not null check (char_length(btrim(event_key)) between 1 and 128),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  unique (encounter_id, event_key)
);

create index rpg_combat_encounters_character_created_idx
  on platform.rpg_combat_encounters(character_id, created_at desc);

alter table platform.rpg_combat_encounters enable row level security;
alter table platform.rpg_combat_commands enable row level security;
revoke all on table platform.rpg_combat_encounters from anon, authenticated;
revoke all on table platform.rpg_combat_commands from anon, authenticated;
grant select on table platform.rpg_combat_encounters to authenticated;
grant select on table platform.rpg_combat_commands to authenticated;

create policy rpg_combat_encounters_select_own on platform.rpg_combat_encounters
  for select to authenticated using (exists (
    select 1 from platform.rpg_characters c
    join platform.rpg_players p on p.id = c.player_id
    where c.id = character_id and p.user_id = (select auth.uid())
  ));
create policy rpg_combat_commands_select_own on platform.rpg_combat_commands
  for select to authenticated using (exists (
    select 1 from platform.rpg_combat_encounters e
    join platform.rpg_characters c on c.id = e.character_id
    join platform.rpg_players p on p.id = c.player_id
    where e.id = encounter_id and p.user_id = (select auth.uid())
  ));

create or replace function platform.rpg_g02_combat_json(p_encounter platform.rpg_combat_encounters)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'id', p_encounter.id::text, 'dungeonId', p_encounter.dungeon_id,
    'status', p_encounter.status, 'waveIndex', p_encounter.wave_index,
    'turnNumber', p_encounter.turn_number, 'playerHp', p_encounter.player_hp,
    'playerMaxHp', p_encounter.player_max_hp, 'enemyId', p_encounter.enemy_id,
    'enemyHp', p_encounter.enemy_hp, 'enemyMaxHp', p_encounter.enemy_max_hp,
    'experienceAwarded', p_encounter.experience_awarded,
    'dropsAwarded', p_encounter.drops_awarded
  )
$$;

create or replace function platform.create_rpg_g02_combat_encounter(p_event_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_character platform.rpg_characters;
  v_encounter platform.rpg_combat_encounters;
begin
  if auth.uid() is null then raise exception 'RPG_UNAUTHENTICATED' using errcode = '42501'; end if;
  if p_event_key is null or char_length(btrim(p_event_key)) not between 1 and 128 then
    raise exception 'RPG_INVALID_EVENT_KEY';
  end if;
  select c.* into v_character from platform.rpg_players p
  join platform.rpg_characters c on c.id = p.active_character_id and c.player_id = p.id
  where p.user_id = auth.uid() for update of c;
  if not found then raise exception 'RPG_FOUNDATION_NOT_INITIALIZED'; end if;
  if v_character.level <> 25 then raise exception 'RPG_G02_LEVEL_25_REQUIRED'; end if;
  select * into v_encounter from platform.rpg_combat_encounters
    where character_id = v_character.id and event_key = btrim(p_event_key);
  if found then return platform.rpg_g02_combat_json(v_encounter); end if;
  insert into platform.rpg_combat_encounters(
    character_id, event_key, dungeon_id, player_hp, player_max_hp,
    enemy_id, enemy_hp, enemy_max_hp
  ) values (
    v_character.id, btrim(p_event_key), 'DUN009',
    72 + 14 * (v_character.level - 1), 72 + 14 * (v_character.level - 1),
    'MON031', 252, 252
  ) returning * into v_encounter;
  return platform.rpg_g02_combat_json(v_encounter);
end;
$$;

create or replace function platform.get_rpg_g02_active_combat()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_encounter platform.rpg_combat_encounters;
begin
  if auth.uid() is null then raise exception 'RPG_UNAUTHENTICATED' using errcode = '42501'; end if;
  select e.* into v_encounter from platform.rpg_combat_encounters e
  join platform.rpg_characters c on c.id = e.character_id
  join platform.rpg_players p on p.id = c.player_id
  where p.user_id = auth.uid() and e.status = 'active'
  order by e.created_at desc limit 1;
  if not found then return null; end if;
  return platform.rpg_g02_combat_json(v_encounter);
end;
$$;

create or replace function platform.submit_rpg_g02_combat_turn(p_encounter_id uuid, p_event_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_encounter platform.rpg_combat_encounters;
  v_existing jsonb;
  v_player_damage integer;
  v_enemy_damage integer;
  v_status text := 'active';
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'RPG_UNAUTHENTICATED' using errcode = '42501'; end if;
  if p_event_key is null or char_length(btrim(p_event_key)) not between 1 and 128 then
    raise exception 'RPG_INVALID_EVENT_KEY';
  end if;
  select e.* into v_encounter from platform.rpg_combat_encounters e
  join platform.rpg_characters c on c.id = e.character_id
  join platform.rpg_players p on p.id = c.player_id
  where e.id = p_encounter_id and p.user_id = auth.uid() for update of e;
  if not found then raise exception 'RPG_COMBAT_NOT_FOUND'; end if;
  select result into v_existing from platform.rpg_combat_commands
    where encounter_id = p_encounter_id and event_key = btrim(p_event_key);
  if found then return v_existing; end if;
  if v_encounter.status <> 'active' then raise exception 'RPG_COMBAT_ALREADY_COMPLETE'; end if;

  -- CombatRulesV1: max(1, attack-floor(defense*.45)) with an independent .90-1.10 roll.
  v_player_damage := greatest(1, floor((84 - floor((case when v_encounter.enemy_id = 'MON031' then 18 else 22 end) * .45)) * (.9 + random() * .2))::integer);
  v_encounter.enemy_hp := greatest(0, v_encounter.enemy_hp - v_player_damage);
  if v_encounter.enemy_hp = 0 then
    if v_encounter.wave_index = 2 then
      v_status := 'victory';
    else
      v_encounter.wave_index := v_encounter.wave_index + 1;
      v_encounter.enemy_id := case when v_encounter.wave_index = 2 then 'MON032' else 'MON031' end;
      v_encounter.enemy_max_hp := case when v_encounter.wave_index = 2 then 426 else 252 end;
      v_encounter.enemy_hp := v_encounter.enemy_max_hp;
    end if;
  else
    v_enemy_damage := greatest(1, floor(((case when v_encounter.enemy_id = 'MON031' then 43 else 50 end) - floor(29 * .45)) * (.9 + random() * .2))::integer);
    v_encounter.player_hp := greatest(0, v_encounter.player_hp - v_enemy_damage);
    if v_encounter.player_hp = 0 then v_status := 'defeat'; end if;
  end if;
  v_encounter.status := v_status;
  v_encounter.turn_number := v_encounter.turn_number + 1;
  update platform.rpg_combat_encounters set
    status = v_encounter.status, wave_index = v_encounter.wave_index,
    turn_number = v_encounter.turn_number, player_hp = v_encounter.player_hp,
    enemy_id = v_encounter.enemy_id, enemy_hp = v_encounter.enemy_hp,
    enemy_max_hp = v_encounter.enemy_max_hp,
    completed_at = case when v_status = 'active' then null else now() end
  where id = v_encounter.id returning * into v_encounter;

  if v_status = 'victory' then
    insert into platform.rpg_progress_events(character_id, event_key, event_type, experience_delta, payload)
      values (v_encounter.character_id, 'combat:' || v_encounter.id::text || ':victory',
        'g02_dun009_trial_cleared', 0, jsonb_build_object('encounterId', v_encounter.id::text))
      on conflict (character_id, event_key) do nothing;
    insert into platform.rpg_cultivation_progress(character_id, trial_status, breakthrough_eligible, breakthrough_status)
      values (v_encounter.character_id, 'passed', true, 'not_attempted')
      on conflict (character_id) do update set trial_status = 'passed',
        breakthrough_eligible = platform.rpg_cultivation_progress.breakthrough_status <> 'succeeded',
        updated_at = now();
  end if;
  v_result := platform.rpg_g02_combat_json(v_encounter);
  insert into platform.rpg_combat_commands(encounter_id, event_key, result)
    values (v_encounter.id, btrim(p_event_key), v_result);
  return v_result;
end;
$$;

revoke all on function platform.rpg_g02_combat_json(platform.rpg_combat_encounters) from public;
revoke all on function platform.create_rpg_g02_combat_encounter(text) from public, anon;
revoke all on function platform.get_rpg_g02_active_combat() from public, anon;
revoke all on function platform.submit_rpg_g02_combat_turn(uuid, text) from public, anon;
grant execute on function platform.create_rpg_g02_combat_encounter(text) to authenticated, service_role;
grant execute on function platform.get_rpg_g02_active_combat() to authenticated, service_role;
grant execute on function platform.submit_rpg_g02_combat_turn(uuid, text) to authenticated, service_role;

commit;
