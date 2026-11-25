-- V3.9 共創夥伴: expose the rebate payout method and referral reward totals to the member view.

begin;

create or replace function sales.member_overview()
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  v_uid uuid := auth.uid();
  v_app sales.applications%rowtype;
  v_biz sales.business_members%rowtype;
  v_att sales.attributions%rowtype;
  v_pub sales.daily_publications%rowtype;
begin
  if v_uid is null then
    raise exception 'SALES_NOT_AUTHENTICATED';
  end if;
  select * into v_app from sales.applications where member_id = v_uid;
  select * into v_biz from sales.business_members where member_id = v_uid;
  if v_app.id is not null then
    select * into v_att from sales.attributions where application_id = v_app.id;
  end if;
  select * into v_pub from sales.daily_publications order by business_day desc limit 1;
  return jsonb_build_object(
    'application', case when v_app.id is null then null else jsonb_build_object(
      'id', v_app.id, 'status', v_app.status, 'submittedAt', v_app.submitted_at,
      'reviewedAt', v_app.reviewed_at, 'approvedAt', v_app.approved_at,
      'decisionReason', v_app.decision_reason) end,
    'member', case when v_biz.id is null then null else jsonb_build_object(
      'businessId', v_biz.id, 'code', v_biz.business_code, 'level', v_biz.level,
      'status', v_biz.status, 'approvedAt', v_biz.approved_at,
      'cashRebateEnabled', v_biz.cash_rebate_enabled,
      'referralRewardCrystals', coalesce((select sum(r.crystals) from sales.referral_rewards r
                                           where r.inviter_business_id = v_biz.id), 0),
      'introducerBusinessId', v_biz.introducer_business_id,
      'introducerCode', (select b.business_code from sales.business_members b
                          where b.id = v_biz.introducer_business_id)) end,
    'attribution', case when v_att.application_id is null then null else jsonb_build_object(
      'status', v_att.status, 'deadlineAt', v_att.deadline_at,
      'confirmedAt', v_att.confirmed_at, 'effectiveAt', v_att.effective_at,
      'introducerCode', (select b.business_code from sales.business_members b
                          where b.id = v_att.introducer_business_id)) end,
    'publication', case when v_pub.business_day is null then null else jsonb_build_object(
      'businessDay', v_pub.business_day, 'publishedAt', v_pub.published_at) end,
    'today', (now() at time zone 'Asia/Taipei')::date
  );
end;
$fn$;

do $grants$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function sales.member_overview() to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function sales.member_overview() to service_role';
  end if;
end;
$grants$;

commit;
