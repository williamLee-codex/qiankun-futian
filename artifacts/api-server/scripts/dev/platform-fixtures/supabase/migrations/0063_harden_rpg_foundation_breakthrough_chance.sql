begin;

alter table platform.rpg_cultivation_attempts
  add column if not exists bonus_rate numeric(6, 5) not null default 0.0,
  add column if not exists calculated_success_rate numeric(6, 5) not null default 0.9,
  add column if not exists effective_success_rate numeric(6, 5) not null default 0.9;

alter table platform.rpg_cultivation_attempts
  add constraint rpg_cultivation_attempts_bonus_rate_check
    check (bonus_rate >= 0.0),
  add constraint rpg_cultivation_attempts_calculated_success_rate_check
    check (calculated_success_rate >= 0.0),
  add constraint rpg_cultivation_attempts_effective_success_rate_check
    check (
      effective_success_rate >= 0.0
      and effective_success_rate <= 1.0
    );

create or replace function platform.attempt_rpg_g02_foundation_breakthrough(p_event_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_character_id uuid;
  v_level integer;
  v_existing_outcome text;
  v_outcome text;
  v_trial_status text;
  v_breakthrough_eligible boolean;
  v_breakthrough_status text;
  v_base_success_rate numeric(6, 5) := 0.9;
  v_bonus_rate numeric(6, 5) := 0.0;
  v_calculated_success_rate numeric(6, 5);
  v_effective_success_rate numeric(6, 5);
begin
  if p_event_key is null
     or char_length(btrim(p_event_key)) < 1
     or char_length(btrim(p_event_key)) > 128 then
    raise exception 'RPG_INVALID_EVENT_KEY';
  end if;

  if auth.uid() is null then
    raise exception 'RPG_UNAUTHENTICATED' using errcode = '42501';
  end if;

  select c.id
    into v_character_id
  from platform.rpg_players p
  join platform.rpg_characters c
    on c.id = p.active_character_id
   and c.player_id = p.id
  where p.user_id = auth.uid()
  for update of c;

  if not found then
    raise exception 'RPG_FOUNDATION_NOT_INITIALIZED';
  end if;

  select level into v_level
  from platform.rpg_characters
  where id = v_character_id;

  if v_level < 25 then
    raise exception 'RPG_G02_LEVEL_25_REQUIRED';
  end if;

  select outcome
    into v_existing_outcome
  from platform.rpg_cultivation_attempts
  where character_id = v_character_id
    and event_key = btrim(p_event_key);

  if found then
    select trial_status, breakthrough_eligible, breakthrough_status
      into v_trial_status, v_breakthrough_eligible, v_breakthrough_status
    from platform.rpg_cultivation_progress
    where character_id = v_character_id;

    return jsonb_build_object(
      'cultivationId', 'BT_QI_FOUNDATION',
      'outcome', v_existing_outcome,
      'trialStatus', v_trial_status,
      'breakthroughEligible', v_breakthrough_eligible,
      'breakthroughStatus', v_breakthrough_status
    );
  end if;

  select trial_status, breakthrough_eligible, breakthrough_status
    into v_trial_status, v_breakthrough_eligible, v_breakthrough_status
  from platform.rpg_cultivation_progress
  where character_id = v_character_id
  for update;

  if not found
     or v_trial_status <> 'passed'
     or not v_breakthrough_eligible
     or v_breakthrough_status = 'succeeded' then
    raise exception 'RPG_G02_TRIAL_REQUIRED';
  end if;

  -- No bonus source is authoritative yet.
  -- Future bonuses must be derived inside the trusted server/database boundary.
  v_calculated_success_rate :=
    v_base_success_rate + v_bonus_rate;

  v_effective_success_rate :=
    least(v_calculated_success_rate, 1.0);

  v_outcome := case
    when random() < v_effective_success_rate
      then 'breakthrough_succeeded'
    else 'breakthrough_failed'
  end;

  insert into platform.rpg_cultivation_attempts (
    character_id,
    event_key,
    cultivation_id,
    outcome,
    base_success_rate,
    bonus_rate,
    calculated_success_rate,
    effective_success_rate
  )
  values (
    v_character_id,
    btrim(p_event_key),
    'BT_QI_FOUNDATION',
    v_outcome,
    v_base_success_rate,
    v_bonus_rate,
    v_calculated_success_rate,
    v_effective_success_rate
  );

  if v_outcome = 'breakthrough_succeeded' then
    update platform.rpg_cultivation_progress
      set breakthrough_eligible = false,
          breakthrough_status = 'succeeded',
          updated_at = now()
      where character_id = v_character_id;

    update platform.rpg_characters
      set cultivation_realm = chr(31689) || chr(22522) || chr(26399),
          updated_at = now()
      where id = v_character_id;
  else
    update platform.rpg_cultivation_progress
      set breakthrough_eligible = true,
          breakthrough_status = 'failed',
          updated_at = now()
      where character_id = v_character_id;
  end if;

  select trial_status, breakthrough_eligible, breakthrough_status
    into v_trial_status, v_breakthrough_eligible, v_breakthrough_status
  from platform.rpg_cultivation_progress
  where character_id = v_character_id;

  return jsonb_build_object(
    'cultivationId', 'BT_QI_FOUNDATION',
    'outcome', v_outcome,
    'trialStatus', v_trial_status,
    'breakthroughEligible', v_breakthrough_eligible,
    'breakthroughStatus', v_breakthrough_status
  );
end;
$$;

revoke all on function platform.attempt_rpg_g02_foundation_breakthrough(text) from public;
revoke all on function platform.attempt_rpg_g02_foundation_breakthrough(text) from anon;

grant execute on function platform.attempt_rpg_g02_foundation_breakthrough(text) to authenticated;
grant execute on function platform.attempt_rpg_g02_foundation_breakthrough(text) to service_role;

commit;
