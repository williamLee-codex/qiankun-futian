-- V3.9 共創夥伴: one-off referral reward in free crystals.
-- Reward failure never blocks application approval; the reward is idempotent per application.

begin;

create table if not exists sales.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references sales.applications(id) on delete restrict,
  invitee_business_id uuid not null references sales.business_members(id) on delete restrict,
  inviter_business_id uuid not null references sales.business_members(id) on delete restrict,
  crystals integer not null check (crystals > 0),
  credited_at timestamptz not null default now()
);

alter table sales.referral_rewards enable row level security;
revoke all on table sales.referral_rewards from anon, authenticated;

-- Drop first: 0128 re-creates this function with a renamed second parameter
-- (p_coins), and CREATE OR REPLACE cannot rename an input parameter, so replaying
-- this migration after 0128 would otherwise fail.
drop function if exists sales.grant_referral_reward(uuid, integer);

create or replace function sales.grant_referral_reward(
  p_application_id uuid, p_crystals integer default 60
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, sales, public, pg_temp as $fn$
declare
  v_app record;
  v_invitee record;
  v_inviter record;
begin
  if p_crystals is null or p_crystals <= 0 then
    return jsonb_build_object('status', 'skipped', 'reason', 'invalid_amount');
  end if;

  select id, member_id, status into v_app from sales.applications where id = p_application_id;
  if not found or v_app.status <> 'approved' then
    return jsonb_build_object('status', 'skipped', 'reason', 'not_approved');
  end if;

  if exists (select 1 from sales.referral_rewards where application_id = p_application_id) then
    return jsonb_build_object('status', 'skipped', 'reason', 'already_rewarded');
  end if;

  select id, member_id, introducer_business_id into v_invitee
    from sales.business_members where application_id = p_application_id;
  if not found or v_invitee.introducer_business_id is null then
    return jsonb_build_object('status', 'skipped', 'reason', 'no_introducer');
  end if;

  select id, member_id into v_inviter
    from sales.business_members where id = v_invitee.introducer_business_id;
  if not found or v_inviter.id = v_invitee.id then
    return jsonb_build_object('status', 'skipped', 'reason', 'self_referral');
  end if;

  insert into sales.referral_rewards
    (application_id, invitee_business_id, inviter_business_id, crystals)
  values (p_application_id, v_invitee.id, v_inviter.id, p_crystals);

  perform public.core_wallet_apply_transaction(
    p_owner_id := v_inviter.member_id,
    p_amount := p_crystals,
    p_currency := 'crystal',
    p_direction := 'credit',
    p_idempotency_key := 'sales-referral-reward:' || p_application_id::text,
    p_reason := 'sales_referral_reward',
    p_reference_id := p_application_id::text,
    p_reference_type := 'sales_referral_reward',
    p_reversal_of := null
  );

  return jsonb_build_object('status', 'granted', 'crystals', p_crystals,
    'inviterBusinessId', v_inviter.id);
end;
$fn$;

grant execute on function sales.grant_referral_reward(uuid, integer) to service_role;

-- Re-issue approval so a successful approval grants the reward exactly once.
create or replace function sales.review_application(
  p_application_id uuid, p_decision text, p_reason text default null,
  p_actor uuid default null, p_actor_email text default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  v_app sales.applications%rowtype;
  v_att sales.attributions%rowtype;
  v_code text;
  v_biz uuid;
  v_now timestamptz := now();
begin
  select * into v_app from sales.applications where id = p_application_id for update;
  if v_app.id is null then
    raise exception 'SALES_APPLICATION_NOT_FOUND';
  end if;
  if v_app.status in ('approved','rejected') then
    raise exception 'SALES_APPLICATION_ALREADY_REVIEWED';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'SALES_INVALID_DECISION';
  end if;
  if p_decision = 'rejected' then
    update sales.applications
       set status = 'rejected', reviewed_at = v_now, reviewed_by = p_actor,
           decision_reason = nullif(btrim(coalesce(p_reason,'')), '')
     where id = p_application_id;
    perform sales.log_audit(p_actor, p_actor_email, 'sales.application.reject', 'sales.applications',
      p_application_id::text, jsonb_build_object('reason', p_reason));
    return jsonb_build_object('status', 'rejected');
  end if;

  select * into v_att from sales.attributions where application_id = p_application_id for update;
  if v_att.application_id is null then
    raise exception 'SALES_ATTRIBUTION_NOT_FOUND';
  end if;
  if v_att.status = 'pending' then
    if v_now < v_att.deadline_at then
      raise exception 'SALES_ATTRIBUTION_PENDING';
    end if;
    update sales.attributions set status = 'company_auto', effective_at = v_att.deadline_at
     where application_id = p_application_id;
    insert into sales.attribution_events (application_id, event_type, effective_at)
    values (p_application_id, 'auto_company', v_att.deadline_at);
    v_att.status := 'company_auto';
    v_att.effective_at := v_att.deadline_at;
  end if;

  loop
    v_code := 'B' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 7));
    exit when not exists (select 1 from sales.business_members where business_code = v_code);
  end loop;

  insert into sales.business_members
    (member_id, business_code, level, status, introducer_business_id, application_id, approved_at)
  values (v_app.member_id, v_code, 1, 'active', v_att.introducer_business_id, v_app.id, v_now)
  returning id into v_biz;

  update sales.applications
     set status = 'approved', reviewed_at = v_now, reviewed_by = p_actor,
         approved_at = v_now, decision_reason = nullif(btrim(coalesce(p_reason,'')), '')
   where id = p_application_id;

  perform sales.log_audit(p_actor, p_actor_email, 'sales.application.approve', 'sales.applications',
    p_application_id::text, jsonb_build_object('businessId', v_biz, 'businessCode', v_code,
      'introducerBusinessId', v_att.introducer_business_id));

  begin
    perform sales.grant_referral_reward(p_application_id);
  exception when others then
    perform sales.log_audit(p_actor, p_actor_email, 'sales.referral.reward_failed',
      'sales.applications', p_application_id::text, jsonb_build_object('error', sqlerrm));
  end;

  return jsonb_build_object('status', 'approved', 'businessId', v_biz, 'businessCode', v_code,
    'introducerBusinessId', v_att.introducer_business_id);
end;
$fn$;

commit;
