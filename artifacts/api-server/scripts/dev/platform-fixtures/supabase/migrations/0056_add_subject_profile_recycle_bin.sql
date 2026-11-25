BEGIN;

-- Subject profile 30-day recycle bin and SELF invariants.
-- Additive only: no production data is deleted by this migration.

alter table public.subject_profiles
  add column if not exists deleted_at timestamptz,
  add column if not exists purged_at timestamptz;

create index if not exists subject_profiles_user_deleted_sort_idx
  on public.subject_profiles (user_id, deleted_at, purged_at, updated_at desc);

create unique index if not exists subject_profiles_one_self_per_user_idx
  on public.subject_profiles (user_id)
  where relationship_code = 'SELF';

create or replace function public.protect_subject_profile_self()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.relationship_code = 'SELF' and new.relationship_code <> 'SELF' then
    raise exception 'SELF_RELATIONSHIP_IMMUTABLE';
  end if;

  if new.relationship_code = 'SELF' then
    if new.is_archived is true then
      raise exception 'SELF_CANNOT_BE_ARCHIVED';
    end if;
    if new.deleted_at is not null or new.purged_at is not null then
      raise exception 'SELF_CANNOT_BE_DELETED';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_subject_profile_self_update on public.subject_profiles;
drop trigger if exists protect_subject_profile_self_write on public.subject_profiles;
create trigger protect_subject_profile_self_write
  before insert or update on public.subject_profiles
  for each row
  execute function public.protect_subject_profile_self();

comment on column public.subject_profiles.deleted_at is
  'Recycle-bin timestamp. Non-SELF profiles remain restorable for 30 days.';

comment on column public.subject_profiles.purged_at is
  'Irreversible tombstone timestamp after the 30-day recycle period. Historical payment, entitlement, report, and quiz evidence is retained by its owning domain.';

create or replace function public.recycle_subject_profile(
  p_subject_profile_id uuid,
  p_now timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $recycle$
declare
  target_relationship text;
  target_deleted_at timestamptz;
  target_purged_at timestamptz;
  replacement_id uuid;
  caller_user_id uuid;
begin
  caller_user_id := auth.uid();
  if caller_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select relationship_code, deleted_at, purged_at
    into target_relationship, target_deleted_at, target_purged_at
  from public.subject_profiles
  where id = p_subject_profile_id and user_id = caller_user_id
  for update;

  if not found then
    raise exception 'SUBJECT_PROFILE_NOT_FOUND';
  end if;
  if target_relationship = 'SELF' or target_deleted_at is not null or target_purged_at is not null then
    raise exception 'INVALID_SUBJECT_PROFILE';
  end if;

  perform 1
  from public.active_profiles
  where user_id = caller_user_id
  for update;

  if exists (
    select 1 from public.active_profiles
    where user_id = caller_user_id and subject_profile_id = p_subject_profile_id
  ) then
    select id into replacement_id
    from public.subject_profiles
    where user_id = caller_user_id
      and relationship_code = 'SELF'
      and is_archived is false
      and deleted_at is null
      and purged_at is null
    limit 1
    for update;

    if replacement_id is null then
      raise exception 'INVALID_SUBJECT_PROFILE';
    end if;

    update public.active_profiles
    set subject_profile_id = replacement_id, updated_at = p_now
    where user_id = caller_user_id;
  end if;

  update public.subject_profiles
  set deleted_at = p_now
  where id = p_subject_profile_id and user_id = caller_user_id;

  return replacement_id;
end;
$recycle$;

revoke all on function public.recycle_subject_profile(uuid, timestamptz) from public;
revoke all on function public.recycle_subject_profile(uuid, timestamptz) from anon;
grant execute on function public.recycle_subject_profile(uuid, timestamptz) to authenticated;

comment on function public.recycle_subject_profile(uuid, timestamptz) is
  'Authenticated-owner atomic recycle operation. Ownership is derived from auth.uid(); if the target is active, the active pointer switches to the usable SELF profile in the same transaction.';

create or replace function public.purge_expired_subject_profiles(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $purge$
declare
  purged_count integer;
begin
  update public.subject_profiles
  set
    display_name = '已刪除命盤',
    birth_date = null,
    birth_time = null,
    birth_place_id = null,
    notes = null,
    purged_at = p_now
  where relationship_code <> 'SELF'
    and deleted_at is not null
    and purged_at is null
    and deleted_at + interval '30 days' <= p_now;

  get diagnostics purged_count = row_count;
  return purged_count;
end;
$purge$;

revoke all on function public.purge_expired_subject_profiles(timestamptz) from public;
revoke all on function public.purge_expired_subject_profiles(timestamptz) from anon;
revoke all on function public.purge_expired_subject_profiles(timestamptz) from authenticated;

comment on function public.purge_expired_subject_profiles(timestamptz) is
  'Server-only idempotent cleanup for non-SELF subject profiles whose 30-day recycle period has expired.';

alter table public.subject_profiles
  drop constraint if exists subject_profiles_purge_after_delete_check,
  add constraint subject_profiles_purge_after_delete_check
    check (purged_at is null or (deleted_at is not null and purged_at >= deleted_at + interval '30 days'));

COMMIT;
