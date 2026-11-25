begin;
-- V3.9 sales business management system.
-- Money is integer TWD cents. Business days use Asia/Taipei.
-- All member access goes through SECURITY DEFINER RPCs that derive identity
-- from auth.uid(); no client role receives write grants.

create schema if not exists sales;

create or replace function sales.touch_updated_at()
returns trigger language plpgsql set search_path = pg_catalog, sales, pg_temp as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

-- ---------------------------------------------------------------- applications
create table if not exists sales.applications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique,
  status text not null default 'submitted'
    check (status in ('submitted','under_review','approved','rejected')),
  terms_version text not null check (length(btrim(terms_version)) between 1 and 64),
  timing_consent_at timestamptz not null,
  valid_topup_consent_at timestamptz not null,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  decision_reason text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_application_consent_before_submit
    check (timing_consent_at <= submitted_at and valid_topup_consent_at <= submitted_at),
  constraint sales_application_approval_consistency
    check ((status = 'approved') = (approved_at is not null)),
  constraint sales_application_review_consistency
    check ((status in ('approved','rejected')) = (reviewed_at is not null)),
  constraint sales_application_reason
    check (status <> 'rejected' or length(btrim(coalesce(decision_reason,''))) > 0)
);

create index if not exists sales_applications_status_idx
  on sales.applications (status, submitted_at desc);

-- ---------------------------------------------------------------- business members
create table if not exists sales.business_members (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique,
  business_code text not null unique check (business_code ~ '^[A-Z0-9]{6,12}$'),
  level smallint not null default 1 check (level between 1 and 6),
  status text not null default 'active' check (status in ('active','suspended','retired')),
  introducer_business_id uuid references sales.business_members(id) on delete restrict,
  application_id uuid not null unique references sales.applications(id) on delete restrict,
  approved_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_business_not_own_introducer check (introducer_business_id is distinct from id)
);

create index if not exists sales_business_members_introducer_idx
  on sales.business_members (introducer_business_id);

create or replace function sales.guard_business_member_tree()
returns trigger language plpgsql set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  v_cursor uuid;
  v_depth integer := 0;
begin
  if new.introducer_business_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.introducer_business_id is distinct from old.introducer_business_id
     and old.introducer_business_id is not null then
    raise exception 'SALES_INTRODUCER_REASSIGNMENT_FORBIDDEN';
  end if;
  v_cursor := new.introducer_business_id;
  while v_cursor is not null loop
    v_depth := v_depth + 1;
    if v_depth > 32 then
      raise exception 'SALES_TREE_DEPTH_EXCEEDED';
    end if;
    if v_cursor = new.id then
      raise exception 'SALES_TREE_CYCLE_FORBIDDEN';
    end if;
    select b.introducer_business_id into v_cursor
      from sales.business_members b where b.id = v_cursor;
  end loop;
  return new;
end;
$fn$;

drop trigger if exists sales_business_member_tree_guard on sales.business_members;
create trigger sales_business_member_tree_guard
before insert or update on sales.business_members
for each row execute function sales.guard_business_member_tree();

drop trigger if exists sales_business_member_touch on sales.business_members;
create trigger sales_business_member_touch
before update on sales.business_members
for each row execute function sales.touch_updated_at();

-- ---------------------------------------------------------------- attributions
create table if not exists sales.attributions (
  application_id uuid primary key references sales.applications(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending','confirmed','company_auto')),
  introducer_member_id uuid,
  introducer_business_id uuid references sales.business_members(id) on delete restrict,
  deadline_at timestamptz not null,
  confirmed_at timestamptz,
  effective_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sales_attribution_state check (
    (status = 'pending' and confirmed_at is null and effective_at is null
      and introducer_business_id is null and introducer_member_id is null)
    or (status = 'confirmed' and confirmed_at is not null and effective_at = confirmed_at
      and introducer_business_id is not null and introducer_member_id is not null)
    or (status = 'company_auto' and confirmed_at is null and effective_at is not null
      and introducer_business_id is null and introducer_member_id is null)
  ),
  constraint sales_attribution_deadline check (deadline_at >= created_at)
);

create table if not exists sales.attribution_events (
  id bigint generated always as identity primary key,
  application_id uuid not null references sales.applications(id) on delete restrict,
  event_type text not null
    check (event_type in ('submitted','confirmed_introducer','confirmed_company','auto_company')),
  introducer_business_id uuid,
  effective_at timestamptz not null,
  recorded_at timestamptz not null default now()
);

create index if not exists sales_attribution_events_application_idx
  on sales.attribution_events (application_id, recorded_at);

-- ---------------------------------------------------------------- customers bound to a business member
create table if not exists sales.customer_attributions (
  member_id uuid primary key,
  business_member_id uuid not null references sales.business_members(id) on delete restrict,
  referral_code text not null,
  source text not null default 'referral_link' check (source in ('referral_link','admin')),
  bound_at timestamptz not null default now()
);

create index if not exists sales_customer_attributions_business_idx
  on sales.customer_attributions (business_member_id, bound_at);

create or replace function sales.guard_customer_attribution_immutable()
returns trigger language plpgsql set search_path = pg_catalog, sales, pg_temp as $fn$
begin
  raise exception 'SALES_CUSTOMER_ATTRIBUTION_IMMUTABLE';
end;
$fn$;

drop trigger if exists sales_customer_attribution_immutable on sales.customer_attributions;
create trigger sales_customer_attribution_immutable
before update or delete on sales.customer_attributions
for each row execute function sales.guard_customer_attribution_immutable();

-- ---------------------------------------------------------------- commission settings
create table if not exists sales.commission_settings (
  version text primary key check (length(btrim(version)) between 1 and 64),
  effective_at timestamptz not null,
  config jsonb not null,
  is_active boolean not null default false,
  published_by uuid,
  published_at timestamptz not null default now()
);

create unique index if not exists sales_commission_settings_single_active
  on sales.commission_settings (is_active) where is_active;

-- ---------------------------------------------------------------- performance entries
create table if not exists sales.performance_entries (
  source_name text not null default 'payment_orders',
  payment_order_id text not null check (length(btrim(payment_order_id)) between 1 and 128),
  business_member_id uuid not null references sales.business_members(id) on delete restrict,
  customer_member_id uuid not null,
  amount_twd_cents bigint not null check (amount_twd_cents > 0),
  reversed_twd_cents bigint not null default 0
    check (reversed_twd_cents >= 0 and reversed_twd_cents <= amount_twd_cents),
  paid_at timestamptz not null,
  business_day date not null,
  source_cursor text not null check (length(btrim(source_cursor)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_name, payment_order_id)
);

create index if not exists sales_performance_entries_member_day_idx
  on sales.performance_entries (business_member_id, business_day);

create index if not exists sales_performance_entries_day_idx
  on sales.performance_entries (business_day);

drop trigger if exists sales_performance_entry_touch on sales.performance_entries;
create trigger sales_performance_entry_touch
before update on sales.performance_entries
for each row execute function sales.touch_updated_at();

-- ---------------------------------------------------------------- refund / chargeback ledger
create table if not exists sales.refund_events (
  source_id text primary key check (length(btrim(source_id)) between 1 and 128),
  original_order_id text not null check (length(btrim(original_order_id)) between 1 and 128),
  kind text not null check (kind in ('refund','chargeback')),
  amount_twd_cents bigint not null check (amount_twd_cents > 0),
  occurred_at timestamptz not null,
  verified boolean not null default false,
  recorded_at timestamptz not null default now()
);

create index if not exists sales_refund_events_order_idx
  on sales.refund_events (original_order_id);

create or replace function sales.guard_refund_event_immutable()
returns trigger language plpgsql set search_path = pg_catalog, sales, pg_temp as $fn$
begin
  raise exception 'SALES_REFUND_EVENT_IMMUTABLE';
end;
$fn$;

drop trigger if exists sales_refund_event_immutable on sales.refund_events;
create trigger sales_refund_event_immutable
before update or delete on sales.refund_events
for each row execute function sales.guard_refund_event_immutable();

-- ---------------------------------------------------------------- settlements
create table if not exists sales.settlements (
  id uuid primary key default gen_random_uuid(),
  period_month date not null unique,
  eligible_topup_cents bigint not null check (eligible_topup_cents >= 0),
  bonus_cap_bps integer not null default 2000 check (bonus_cap_bps between 0 and 2000),
  settings_version text not null references sales.commission_settings(version) on delete restrict,
  status text not null default 'draft' check (status in ('draft','approved','paid')),
  approved_at timestamptz,
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint sales_settlement_month_first_day check (extract(day from period_month) = 1),
  constraint sales_settlement_state check (
    (status = 'draft' and approved_at is null and paid_at is null)
    or (status = 'approved' and approved_at is not null and paid_at is null)
    or (status = 'paid' and approved_at is not null and paid_at is not null and paid_at >= approved_at)
  )
);

create table if not exists sales.settlement_bonus_lines (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references sales.settlements(id) on delete restrict,
  beneficiary_business_id uuid not null references sales.business_members(id) on delete restrict,
  category text not null
    check (category in ('personal','team','organization','leaderboard','campaign','other','adjustment')),
  source_key text not null check (length(btrim(source_key)) > 0 and source_key = btrim(source_key)),
  amount_cents bigint not null
    check (amount_cents >= 0 or category = 'adjustment'),
  basis jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (settlement_id, beneficiary_business_id, category, source_key)
);

create index if not exists sales_settlement_bonus_beneficiary_idx
  on sales.settlement_bonus_lines (beneficiary_business_id, settlement_id);

create table if not exists sales.settlement_adjustments (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references sales.settlements(id) on delete restrict,
  beneficiary_business_id uuid not null references sales.business_members(id) on delete restrict,
  source_key text not null check (length(btrim(source_key)) > 0 and source_key = btrim(source_key)),
  amount_delta_cents bigint not null check (amount_delta_cents <> 0),
  reason text not null check (length(btrim(reason)) > 0),
  recorded_by uuid,
  recorded_at timestamptz not null default now(),
  unique (beneficiary_business_id, source_key)
);

create table if not exists sales.settlement_payment_records (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references sales.settlements(id) on delete restrict,
  beneficiary_business_id uuid not null references sales.business_members(id) on delete restrict,
  payment_reference text not null unique
    check (length(btrim(payment_reference)) > 0 and payment_reference = btrim(payment_reference)),
  paid_cents bigint not null check (paid_cents > 0),
  paid_at timestamptz not null,
  recorded_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists sales_settlement_payments_beneficiary_idx
  on sales.settlement_payment_records (settlement_id, beneficiary_business_id);

create or replace function sales.guard_bonus_line_mutation()
returns trigger language plpgsql set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  parent_status text;
begin
  if tg_op = 'UPDATE' and new.settlement_id <> old.settlement_id then
    raise exception 'BONUS_SETTLEMENT_REASSIGNMENT_FORBIDDEN';
  end if;
  select status into parent_status from sales.settlements
   where id = case when tg_op = 'DELETE' then old.settlement_id else new.settlement_id end
   for update;
  if parent_status is null or parent_status <> 'draft' then
    raise exception 'SETTLEMENT_LINES_IMMUTABLE';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$fn$;

drop trigger if exists sales_bonus_line_guard on sales.settlement_bonus_lines;
create trigger sales_bonus_line_guard
before insert or update or delete on sales.settlement_bonus_lines
for each row execute function sales.guard_bonus_line_mutation();

create or replace function sales.guard_settlement_transition()
returns trigger language plpgsql set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  total_bonus numeric;
begin
  if tg_op = 'DELETE' then
    raise exception 'SETTLEMENT_DELETE_FORBIDDEN';
  end if;
  if old.status = 'paid' then
    raise exception 'PAID_SETTLEMENT_IMMUTABLE';
  end if;
  if new.id is distinct from old.id
     or new.period_month is distinct from old.period_month
     or new.created_at is distinct from old.created_at
     or new.settings_version is distinct from old.settings_version then
    raise exception 'SETTLEMENT_IDENTITY_IMMUTABLE';
  end if;
  if old.status = 'approved' then
    if new.status <> 'paid' or new.approved_at is distinct from old.approved_at
       or new.eligible_topup_cents is distinct from old.eligible_topup_cents
       or new.bonus_cap_bps is distinct from old.bonus_cap_bps then
      raise exception 'INVALID_SETTLEMENT_TRANSITION';
    end if;
    if exists (
      with owed as (
        select beneficiary_business_id, sum(amount_cents) as cents
          from sales.settlement_bonus_lines where settlement_id = old.id
         group by beneficiary_business_id
      ), paid as (
        select beneficiary_business_id, sum(paid_cents) as cents
          from sales.settlement_payment_records where settlement_id = old.id
         group by beneficiary_business_id
      )
      select 1 from owed full join paid using (beneficiary_business_id)
       where coalesce(owed.cents, 0) <> coalesce(paid.cents, 0)
    ) then
      raise exception 'SETTLEMENT_NOT_FULLY_PAID';
    end if;
  elsif old.status = 'draft' then
    if new.status = 'paid' then
      raise exception 'INVALID_SETTLEMENT_TRANSITION';
    end if;
    if new.status = 'approved' then
      select coalesce(sum(amount_cents), 0) into total_bonus
        from sales.settlement_bonus_lines where settlement_id = old.id;
      if total_bonus * 10000 > new.eligible_topup_cents::numeric * new.bonus_cap_bps then
        raise exception 'TOTAL_BONUS_CAP_EXCEEDED';
      end if;
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists sales_settlement_guard on sales.settlements;
create trigger sales_settlement_guard
before update or delete on sales.settlements
for each row execute function sales.guard_settlement_transition();

create or replace function sales.guard_payment_record_mutation()
returns trigger language plpgsql set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  parent_status text;
  parent_approved_at timestamptz;
  owed_cents numeric;
  already_paid_cents numeric;
begin
  if tg_op <> 'INSERT' then
    raise exception 'PAYMENT_RECORD_IMMUTABLE';
  end if;
  select status, approved_at into parent_status, parent_approved_at
    from sales.settlements where id = new.settlement_id for update;
  if parent_status is distinct from 'approved' then
    raise exception 'PAYMENT_REQUIRES_APPROVED_SETTLEMENT';
  end if;
  if new.paid_at < parent_approved_at then
    raise exception 'PAYMENT_PREDATES_APPROVAL';
  end if;
  select coalesce(sum(amount_cents), 0) into owed_cents
    from sales.settlement_bonus_lines
   where settlement_id = new.settlement_id
     and beneficiary_business_id = new.beneficiary_business_id;
  select coalesce(sum(paid_cents), 0) into already_paid_cents
    from sales.settlement_payment_records
   where settlement_id = new.settlement_id
     and beneficiary_business_id = new.beneficiary_business_id;
  if already_paid_cents + new.paid_cents > owed_cents then
    raise exception 'SETTLEMENT_PAYMENT_EXCEEDS_ENTITLEMENT';
  end if;
  return new;
end;
$fn$;

drop trigger if exists sales_payment_record_guard on sales.settlement_payment_records;
create trigger sales_payment_record_guard
before insert or update or delete on sales.settlement_payment_records
for each row execute function sales.guard_payment_record_mutation();

create or replace function sales.guard_adjustment_mutation()
returns trigger language plpgsql set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  parent_status text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'SETTLEMENT_ADJUSTMENT_IMMUTABLE';
  end if;
  select status into parent_status from sales.settlements where id = new.settlement_id for update;
  if parent_status is null or parent_status not in ('approved','paid') then
    raise exception 'ADJUSTMENT_REQUIRES_FINALIZED_SETTLEMENT';
  end if;
  return new;
end;
$fn$;

drop trigger if exists sales_adjustment_guard on sales.settlement_adjustments;
create trigger sales_adjustment_guard
before insert or update or delete on sales.settlement_adjustments
for each row execute function sales.guard_adjustment_mutation();

-- ---------------------------------------------------------------- bulletins (sales only)
create table if not exists sales.bulletins (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  body text not null check (length(btrim(body)) between 1 and 10000),
  pinned boolean not null default false,
  status text not null default 'draft' check (status in ('draft','published','withdrawn')),
  published_at timestamptz,
  withdrawn_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_bulletin_publication check (
    (status = 'draft' and published_at is null and withdrawn_at is null)
    or (status = 'published' and published_at is not null and withdrawn_at is null)
    or (status = 'withdrawn' and published_at is not null and withdrawn_at is not null
      and withdrawn_at >= published_at)
  )
);

create index if not exists sales_bulletins_public_idx
  on sales.bulletins (status, pinned desc, published_at desc);

create table if not exists sales.bulletin_revisions (
  id bigint generated always as identity primary key,
  bulletin_id uuid not null references sales.bulletins(id) on delete restrict,
  action text not null check (action in ('created','updated','published','withdrawn')),
  title text not null,
  body text not null,
  pinned boolean not null,
  status text not null,
  actor_id uuid,
  recorded_at timestamptz not null default now()
);

create index if not exists sales_bulletin_revisions_bulletin_idx
  on sales.bulletin_revisions (bulletin_id, recorded_at desc);

drop trigger if exists sales_bulletin_touch on sales.bulletins;
create trigger sales_bulletin_touch
before update on sales.bulletins
for each row execute function sales.touch_updated_at();

-- ---------------------------------------------------------------- admin audit
create table if not exists sales.admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_email text,
  action text not null check (length(btrim(action)) > 0),
  entity text not null check (length(btrim(entity)) > 0),
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sales_admin_audit_created_idx
  on sales.admin_audit (created_at desc);

create or replace function sales.guard_admin_audit_immutable()
returns trigger language plpgsql set search_path = pg_catalog, sales, pg_temp as $fn$
begin
  raise exception 'SALES_ADMIN_AUDIT_IMMUTABLE';
end;
$fn$;

drop trigger if exists sales_admin_audit_immutable on sales.admin_audit;
create trigger sales_admin_audit_immutable
before update or delete on sales.admin_audit
for each row execute function sales.guard_admin_audit_immutable();

-- ---------------------------------------------------------------- daily sync state
create table if not exists sales.sync_watermarks (
  source_name text primary key check (source_name in ('payment_orders')),
  cursor_key text not null check (length(btrim(cursor_key)) > 0),
  updated_at timestamptz not null default now()
);

create table if not exists sales.sync_slots (
  source_name text not null references sales.sync_watermarks(source_name) on delete restrict,
  slot_start timestamptz not null,
  cursor_key text not null check (length(btrim(cursor_key)) > 0),
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (source_name, slot_start)
);

create table if not exists sales.sync_failures (
  id bigint generated always as identity primary key,
  source_name text not null default 'payment_orders',
  slot_start timestamptz,
  business_day date,
  error_code text not null check (length(btrim(error_code)) > 0),
  recorded_at timestamptz not null default now()
);

create index if not exists sales_sync_failures_day_idx
  on sales.sync_failures (business_day, recorded_at desc);

create table if not exists sales.daily_publications (
  business_day date primary key,
  published_at timestamptz not null default now(),
  eligible_cents bigint not null check (eligible_cents >= 0),
  reversed_cents bigint not null check (reversed_cents >= 0),
  entry_count integer not null check (entry_count >= 0),
  published_by uuid
);

-- ---------------------------------------------------------------- provider observations
create table if not exists sales.provider_observation_checkpoints (
  environment text primary key check (environment in ('production','sandbox')),
  cursor_key text not null check (length(btrim(cursor_key)) > 0)
);

create table if not exists sales.provider_trade_observations (
  environment text not null check (environment in ('production','sandbox')),
  payment_order_id text not null check (length(btrim(payment_order_id)) > 0),
  merchant_order_no text not null check (merchant_order_no ~ '^[A-Za-z0-9_]{1,30}$'),
  trade_no text not null check (trade_no ~ '^[A-Za-z0-9]{1,20}$'),
  amount_twd bigint not null check (amount_twd between 1 and 9999999999),
  observed_at timestamptz not null,
  source_updated_at timestamptz not null,
  trade_status text not null check (trade_status in ('0','1','2','3','6')),
  payment_type text not null,
  pay_time text not null,
  expected_fund_time text not null,
  close_status text not null,
  close_amount text not null,
  back_status text not null,
  back_balance text not null,
  primary key (environment, payment_order_id, observed_at)
);

create table if not exists sales.provider_observation_slots (
  environment text not null references sales.provider_observation_checkpoints(environment) on delete restrict,
  slot_start timestamptz not null,
  cursor_key text not null,
  completed_at timestamptz not null default now(),
  primary key (environment, slot_start)
);

-- ---------------------------------------------------------------- audit helper
create or replace function sales.log_audit(
  p_actor uuid, p_email text, p_action text, p_entity text, p_entity_id text, p_metadata jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = pg_catalog, sales, pg_temp as $fn$
  insert into sales.admin_audit (actor_id, actor_email, action, entity, entity_id, metadata)
  values (p_actor, p_email, p_action, p_entity, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
$fn$;

create or replace function sales.current_business_id()
returns uuid language plpgsql stable security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    return null;
  end if;
  select b.id into v_id from sales.business_members b
   where b.member_id = v_uid and b.status = 'active';
  return v_id;
end;
$fn$;

create or replace function sales.owns_settlement(p_settlement_id uuid)
returns boolean language plpgsql stable security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  v_biz uuid := sales.current_business_id();
begin
  if v_biz is null then
    return false;
  end if;
  return exists (
    select 1 from sales.settlement_bonus_lines l
     where l.settlement_id = p_settlement_id and l.beneficiary_business_id = v_biz
  );
end;
$fn$;

-- ---------------------------------------------------------------- member reads
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

create or replace function sales.member_performance(p_month date default null)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  v_biz uuid := sales.current_business_id();
  v_start date;
  v_end date;
  v_level smallint;
  v_personal bigint := 0;
  v_org bigint := 0;
  v_lifetime bigint := 0;
  v_teams jsonb := '[]'::jsonb;
  v_settings jsonb;
  v_brackets jsonb := '[]'::jsonb;
  v_next bigint;
begin
  if v_biz is null then
    raise exception 'SALES_NOT_A_BUSINESS_MEMBER';
  end if;
  v_start := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Taipei')::date))::date;
  v_end := (v_start + interval '1 month')::date;
  select b.level into v_level from sales.business_members b where b.id = v_biz;

  select coalesce(sum(e.amount_twd_cents - e.reversed_twd_cents), 0) into v_personal
    from sales.performance_entries e
   where e.business_member_id = v_biz and e.business_day >= v_start and e.business_day < v_end;

  select coalesce(sum(e.amount_twd_cents - e.reversed_twd_cents), 0) into v_lifetime
    from sales.performance_entries e where e.business_member_id = v_biz;

  with recursive tree as (
    select b.id as business_id, 1 as depth, b.id as root_child
      from sales.business_members b where b.introducer_business_id = v_biz
    union all
    select c.id, t.depth + 1, t.root_child
      from sales.business_members c join tree t on c.introducer_business_id = t.business_id
     where t.depth < 32
  )
  select coalesce(sum(e.amount_twd_cents - e.reversed_twd_cents), 0) into v_org
    from tree t join sales.performance_entries e on e.business_member_id = t.business_id
   where e.business_day >= v_start and e.business_day < v_end;

  with recursive tree as (
    select b.id as business_id, 1 as depth, b.id as root_child
      from sales.business_members b where b.introducer_business_id = v_biz
    union all
    select c.id, t.depth + 1, t.root_child
      from sales.business_members c join tree t on c.introducer_business_id = t.business_id
     where t.depth < 32
  )
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.branch_cents desc, x.code), '[]'::jsonb)
    into v_teams
    from (
      select t.root_child as business_id, bm.business_code as code, bm.level,
             coalesce(sum(e.amount_twd_cents - e.reversed_twd_cents), 0)::bigint as branch_cents
        from tree t
        join sales.business_members bm on bm.id = t.root_child
        left join sales.performance_entries e
          on e.business_member_id = t.business_id
         and e.business_day >= v_start and e.business_day < v_end
       group by t.root_child, bm.business_code, bm.level
    ) x;

  select config into v_settings from sales.commission_settings where is_active;
  if v_settings is not null and v_settings->'personal'->v_level::text is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'thresholdCents', (r->>'thresholdCents')::bigint,
             'rateBps', (r->>'rateBps')::integer) order by (r->>'thresholdCents')::bigint), '[]'::jsonb)
      into v_brackets
      from (
        select jsonb_build_object(
                 'thresholdCents', v_settings->'personal'->v_level::text->'thresholdsCents'->>(i - 1),
                 'rateBps', v_settings->'personal'->v_level::text->'ratesBps'->>(i - 1)) as r
          from generate_series(1, jsonb_array_length(
                 coalesce(v_settings->'personal'->v_level::text->'thresholdsCents', '[]'::jsonb))) i
      ) x;
    select min((t.v)::bigint) into v_next
      from jsonb_array_elements_text(
             coalesce(v_settings->'personal'->v_level::text->'thresholdsCents', '[]'::jsonb)) as t(v)
     where (t.v)::bigint > v_personal;
  end if;

  return jsonb_build_object(
    'month', to_char(v_start, 'YYYY-MM'),
    'level', v_level,
    'personalCents', v_personal,
    'organizationCents', v_org,
    'lifetimeCents', v_lifetime,
    'directTeams', v_teams,
    'brackets', v_brackets,
    'nextThresholdCents', v_next,
    'settingsVersion', (select version from sales.commission_settings where is_active)
  );
end;
$fn$;

create or replace function sales.member_commissions()
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  v_biz uuid := sales.current_business_id();
begin
  if v_biz is null then
    raise exception 'SALES_NOT_A_BUSINESS_MEMBER';
  end if;
  return jsonb_build_object(
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'settlementId', l.settlement_id, 'periodMonth', to_char(s.period_month, 'YYYY-MM'),
        'category', l.category, 'sourceKey', l.source_key,
        'amountCents', l.amount_cents, 'basis', l.basis,
        'settlementStatus', s.status, 'approvedAt', s.approved_at, 'paidAt', s.paid_at)
        order by s.period_month desc, l.category, l.created_at)
        from sales.settlement_bonus_lines l
        join sales.settlements s on s.id = l.settlement_id
       where l.beneficiary_business_id = v_biz), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'settlementId', p.settlement_id, 'paymentReference', p.payment_reference,
        'paidCents', p.paid_cents, 'paidAt', p.paid_at)
        order by p.paid_at desc)
        from sales.settlement_payment_records p
       where p.beneficiary_business_id = v_biz), '[]'::jsonb),
    'adjustments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'settlementId', a.settlement_id, 'sourceKey', a.source_key,
        'amountDeltaCents', a.amount_delta_cents, 'reason', a.reason,
        'recordedAt', a.recorded_at)
        order by a.recorded_at desc)
        from sales.settlement_adjustments a
       where a.beneficiary_business_id = v_biz), '[]'::jsonb)
  );
end;
$fn$;

create or replace function sales.member_bulletins()
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'SALES_NOT_AUTHENTICATED';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', b.id, 'title', b.title, 'body', b.body, 'pinned', b.pinned,
      'publishedAt', b.published_at) order by b.pinned desc, b.published_at desc)
      from sales.bulletins b
     where b.status = 'published' and b.withdrawn_at is null and b.published_at <= now()), '[]'::jsonb);
end;
$fn$;

create or replace function sales.my_referral_info()
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  v_biz uuid := sales.current_business_id();
  v_code text;
begin
  if v_biz is null then
    raise exception 'SALES_NOT_A_BUSINESS_MEMBER';
  end if;
  select business_code into v_code from sales.business_members where id = v_biz;
  return jsonb_build_object(
    'code', v_code,
    'path', '/sales/join?ref=' || v_code,
    'boundCustomers', (select count(*) from sales.customer_attributions c where c.business_member_id = v_biz),
    'recentBindings', coalesce((
      select jsonb_agg(jsonb_build_object('memberId', c.member_id, 'boundAt', c.bound_at)
             order by c.bound_at desc)
        from (select * from sales.customer_attributions c
               where c.business_member_id = v_biz order by c.bound_at desc limit 20) c), '[]'::jsonb)
  );
end;
$fn$;

-- ---------------------------------------------------------------- member writes
create or replace function sales.submit_my_application(
  p_terms_version text, p_timing_rules_accepted boolean, p_valid_topup_rules_accepted boolean
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  v_uid uuid := auth.uid();
  v_terms text := btrim(coalesce(p_terms_version, ''));
  v_now timestamptz := now();
  v_id uuid;
  v_att uuid;
begin
  if v_uid is null then
    raise exception 'SALES_NOT_AUTHENTICATED';
  end if;
  if p_timing_rules_accepted is not true or p_valid_topup_rules_accepted is not true then
    raise exception 'SALES_APPLICATION_CONSENT_REQUIRED';
  end if;
  if length(v_terms) = 0 or length(v_terms) > 64 then
    raise exception 'SALES_TERMS_VERSION_REQUIRED';
  end if;
  begin
    insert into sales.applications (member_id, terms_version, timing_consent_at, valid_topup_consent_at, submitted_at)
    values (v_uid, v_terms, v_now, v_now, v_now)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'SALES_APPLICATION_EXISTS';
  end;
  insert into sales.attributions (application_id, deadline_at, created_at)
  values (v_id, v_now + interval '72 hours', v_now)
  returning application_id into v_att;
  insert into sales.attribution_events (application_id, event_type, effective_at)
  values (v_id, 'submitted', v_now);
  return jsonb_build_object('id', v_id, 'status', 'submitted', 'submittedAt', v_now,
                            'attributionDeadline', v_now + interval '72 hours');
end;
$fn$;

create or replace function sales.confirm_my_attribution(p_application_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  v_uid uuid := auth.uid();
  v_biz uuid := sales.current_business_id();
  v_app sales.applications%rowtype;
  v_att sales.attributions%rowtype;
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'SALES_NOT_AUTHENTICATED';
  end if;
  select * into v_app from sales.applications where id = p_application_id for update;
  if v_app.id is null then
    raise exception 'SALES_APPLICATION_NOT_FOUND';
  end if;
  if v_app.member_id = v_uid then
    raise exception 'SALES_SELF_ATTRIBUTION_FORBIDDEN';
  end if;
  if v_biz is null then
    raise exception 'SALES_NOT_A_BUSINESS_MEMBER';
  end if;
  select * into v_att from sales.attributions where application_id = p_application_id for update;
  if v_att.application_id is null then
    raise exception 'SALES_ATTRIBUTION_NOT_FOUND';
  end if;
  if v_att.status <> 'pending' then
    raise exception 'SALES_ATTRIBUTION_LOCKED';
  end if;
  if v_now >= v_att.deadline_at then
    raise exception 'SALES_ATTRIBUTION_EXPIRED';
  end if;
  update sales.attributions
     set status = 'confirmed', introducer_member_id = v_uid,
         introducer_business_id = v_biz, confirmed_at = v_now, effective_at = v_now
   where application_id = p_application_id;
  insert into sales.attribution_events (application_id, event_type, introducer_business_id, effective_at)
  values (p_application_id, 'confirmed_introducer', v_biz, v_now);
  return jsonb_build_object('status', 'confirmed', 'effectiveAt', v_now);
end;
$fn$;

create or replace function sales.bind_my_referral(p_code text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  v_uid uuid := auth.uid();
  v_biz sales.business_members%rowtype;
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'SALES_NOT_AUTHENTICATED';
  end if;
  select * into v_biz from sales.business_members
   where business_code = upper(btrim(coalesce(p_code, ''))) and status = 'active';
  if v_biz.id is null then
    raise exception 'SALES_REFERRAL_CODE_INVALID';
  end if;
  if v_biz.member_id = v_uid then
    raise exception 'SALES_REFERRAL_SELF_FORBIDDEN';
  end if;
  begin
    insert into sales.customer_attributions (member_id, business_member_id, referral_code, bound_at)
    values (v_uid, v_biz.id, v_biz.business_code, v_now);
  exception when unique_violation then
    raise exception 'SALES_ALREADY_BOUND';
  end;
  return jsonb_build_object('businessCode', v_biz.business_code, 'boundAt', v_now);
end;
$fn$;

create or replace function sales.resolve_overdue_attributions(p_now timestamptz default now())
returns integer language plpgsql security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  v_row sales.attributions%rowtype;
  v_count integer := 0;
begin
  for v_row in
    select * from sales.attributions
     where status = 'pending' and p_now >= deadline_at
     for update
  loop
    update sales.attributions
       set status = 'company_auto', effective_at = v_row.deadline_at
     where application_id = v_row.application_id;
    insert into sales.attribution_events (application_id, event_type, effective_at)
    values (v_row.application_id, 'auto_company', v_row.deadline_at);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$fn$;

-- ---------------------------------------------------------------- admin writes
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
  return jsonb_build_object('status', 'approved', 'businessId', v_biz, 'businessCode', v_code,
    'introducerBusinessId', v_att.introducer_business_id);
end;
$fn$;

create or replace function sales.set_member_level(
  p_business_id uuid, p_level integer, p_actor uuid default null, p_actor_email text default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  v_old integer;
begin
  if p_level is null or p_level < 1 or p_level > 6 then
    raise exception 'SALES_INVALID_LEVEL';
  end if;
  select level into v_old from sales.business_members where id = p_business_id for update;
  if v_old is null then
    raise exception 'SALES_MEMBER_NOT_FOUND';
  end if;
  update sales.business_members set level = p_level where id = p_business_id;
  perform sales.log_audit(p_actor, p_actor_email, 'sales.member.level', 'sales.business_members',
    p_business_id::text, jsonb_build_object('from', v_old, 'to', p_level));
  return jsonb_build_object('businessId', p_business_id, 'level', p_level);
end;
$fn$;

create or replace function sales.set_member_status(
  p_business_id uuid, p_status text, p_actor uuid default null, p_actor_email text default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
begin
  if p_status not in ('active','suspended','retired') then
    raise exception 'SALES_INVALID_STATUS';
  end if;
  update sales.business_members set status = p_status where id = p_business_id;
  if not found then
    raise exception 'SALES_MEMBER_NOT_FOUND';
  end if;
  perform sales.log_audit(p_actor, p_actor_email, 'sales.member.status', 'sales.business_members',
    p_business_id::text, jsonb_build_object('status', p_status));
  return jsonb_build_object('businessId', p_business_id, 'status', p_status);
end;
$fn$;

create or replace function sales.set_commission_settings(
  p_version text, p_effective_at timestamptz, p_config jsonb, p_activate boolean,
  p_actor uuid default null, p_actor_email text default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  v_level integer;
  v_rule jsonb;
begin
  if length(btrim(coalesce(p_version,''))) = 0 then
    raise exception 'SALES_SETTINGS_VERSION_REQUIRED';
  end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'SALES_SETTINGS_INVALID';
  end if;
  for v_level in 1..6 loop
    v_rule := p_config->'personal'->v_level::text;
    if v_rule is null
       or jsonb_typeof(v_rule->'thresholdsCents') <> 'array'
       or jsonb_typeof(v_rule->'ratesBps') <> 'array'
       or jsonb_array_length(v_rule->'ratesBps') <> jsonb_array_length(v_rule->'thresholdsCents') + 1 then
      raise exception 'SALES_SETTINGS_INVALID_PERSONAL';
    end if;
  end loop;
  for v_level in 2..6 loop
    v_rule := p_config->'organization'->v_level::text;
    if v_rule is null
       or jsonb_typeof(v_rule->'thresholdsCents') <> 'array'
       or jsonb_typeof(v_rule->'ratesBps') <> 'array'
       or jsonb_array_length(v_rule->'ratesBps') <> jsonb_array_length(v_rule->'thresholdsCents') + 1 then
      raise exception 'SALES_SETTINGS_INVALID_ORGANIZATION';
    end if;
  end loop;
  insert into sales.commission_settings (version, effective_at, config, is_active, published_by)
  values (btrim(p_version), p_effective_at, p_config, false, p_actor)
  on conflict (version) do nothing;
  if not found then
    raise exception 'SALES_SETTINGS_VERSION_EXISTS';
  end if;
  if p_activate then
    update sales.commission_settings set is_active = false where is_active;
    update sales.commission_settings set is_active = true where version = btrim(p_version);
  end if;
  perform sales.log_audit(p_actor, p_actor_email, 'sales.settings.publish', 'sales.commission_settings',
    btrim(p_version), jsonb_build_object('active', coalesce(p_activate, false)));
  return jsonb_build_object('version', btrim(p_version), 'active', coalesce(p_activate, false));
end;
$fn$;

create or replace function sales.save_bulletin(
  p_bulletin_id uuid, p_title text, p_body text, p_pinned boolean, p_action text,
  p_actor uuid default null, p_actor_email text default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  v_row sales.bulletins%rowtype;
  v_id uuid;
  v_action text := coalesce(p_action, 'save');
  v_now timestamptz := now();
begin
  if v_action not in ('save','publish','withdraw') then
    raise exception 'SALES_BULLETIN_INVALID_ACTION';
  end if;
  if p_bulletin_id is null then
    if v_action = 'withdraw' then
      raise exception 'SALES_BULLETIN_NOT_FOUND';
    end if;
    if length(btrim(coalesce(p_title,''))) = 0 or length(btrim(coalesce(p_body,''))) = 0 then
      raise exception 'SALES_BULLETIN_INVALID';
    end if;
    insert into sales.bulletins (title, body, pinned, status, published_at, created_by)
    values (btrim(p_title), btrim(p_body), coalesce(p_pinned,false),
            case when v_action = 'publish' then 'published' else 'draft' end,
            case when v_action = 'publish' then v_now else null end,
            p_actor)
    returning id into v_id;
    select * into v_row from sales.bulletins where id = v_id;
    insert into sales.bulletin_revisions (bulletin_id, action, title, body, pinned, status, actor_id)
    values (v_id, case when v_action = 'publish' then 'published' else 'created' end,
            v_row.title, v_row.body, v_row.pinned, v_row.status, p_actor);
    perform sales.log_audit(p_actor, p_actor_email, 'sales.bulletin.create', 'sales.bulletins',
      v_id::text, jsonb_build_object('status', v_row.status));
    return jsonb_build_object('id', v_id, 'status', v_row.status);
  end if;

  select * into v_row from sales.bulletins where id = p_bulletin_id for update;
  if v_row.id is null then
    raise exception 'SALES_BULLETIN_NOT_FOUND';
  end if;
  if v_row.status = 'withdrawn' then
    raise exception 'SALES_BULLETIN_WITHDRAWN_IMMUTABLE';
  end if;

  if v_action = 'withdraw' then
    update sales.bulletins set status = 'withdrawn', withdrawn_at = v_now where id = p_bulletin_id;
    select * into v_row from sales.bulletins where id = p_bulletin_id;
    insert into sales.bulletin_revisions (bulletin_id, action, title, body, pinned, status, actor_id)
    values (p_bulletin_id, 'withdrawn', v_row.title, v_row.body, v_row.pinned, v_row.status, p_actor);
    perform sales.log_audit(p_actor, p_actor_email, 'sales.bulletin.withdraw', 'sales.bulletins',
      p_bulletin_id::text, '{}'::jsonb);
    return jsonb_build_object('id', p_bulletin_id, 'status', 'withdrawn');
  end if;

  if length(btrim(coalesce(p_title,''))) = 0 or length(btrim(coalesce(p_body,''))) = 0 then
    raise exception 'SALES_BULLETIN_INVALID';
  end if;
  update sales.bulletins
     set title = btrim(p_title), body = btrim(p_body), pinned = coalesce(p_pinned, pinned),
         status = case when v_action = 'publish' then 'published' else status end,
         published_at = case when v_action = 'publish' then coalesce(published_at, v_now) else published_at end
   where id = p_bulletin_id;
  select * into v_row from sales.bulletins where id = p_bulletin_id;
  insert into sales.bulletin_revisions (bulletin_id, action, title, body, pinned, status, actor_id)
  values (p_bulletin_id, case when v_action = 'publish' then 'published' else 'updated' end,
          v_row.title, v_row.body, v_row.pinned, v_row.status, p_actor);
  perform sales.log_audit(p_actor, p_actor_email,
    case when v_action = 'publish' then 'sales.bulletin.publish' else 'sales.bulletin.update' end,
    'sales.bulletins', p_bulletin_id::text, jsonb_build_object('status', v_row.status));
  return jsonb_build_object('id', p_bulletin_id, 'status', v_row.status);
end;
$fn$;

-- ---------------------------------------------------------------- sync + publication
create unique index if not exists sales_sync_failures_slot_idx
  on sales.sync_failures (source_name, slot_start) where slot_start is not null;

create or replace function sales.record_sync_failure(
  p_slot timestamptz, p_day date, p_error text
) returns void language plpgsql security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
begin
  insert into sales.sync_failures (source_name, slot_start, business_day, error_code)
  values ('payment_orders', p_slot, p_day, left(coalesce(nullif(btrim(p_error), ''), 'SALES_SYNC_FAILED'), 200))
  on conflict (source_name, slot_start) where slot_start is not null
  do update set error_code = excluded.error_code, business_day = excluded.business_day, recorded_at = now();
end;
$fn$;

create or replace function sales.commit_sync_page(
  p_slot timestamptz, p_expected_cursor text, p_next_cursor text, p_completed boolean, p_events jsonb
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  v_cursor text;
  v_slot_cursor text;
  v_slot_completed boolean;
  v_event jsonb;
  v_customer uuid;
  v_biz uuid;
  v_joined timestamptz;
  v_paid_at timestamptz;
  v_amount bigint;
  v_inserted integer := 0;
  v_skipped integer := 0;
begin
  if p_slot is null
     or (p_slot at time zone 'Asia/Taipei')::time < time '03:00'
     or (p_slot at time zone 'Asia/Taipei')::time > time '04:50'
     or extract(minute from p_slot at time zone 'Asia/Taipei')::integer % 10 <> 0
     or extract(second from p_slot at time zone 'Asia/Taipei') <> 0 then
    raise exception 'SALES_SYNC_INVALID_SLOT';
  end if;
  if (p_slot at time zone 'Asia/Taipei')::time > time '03:00'
     and not exists (
       select 1 from sales.sync_slots
        where source_name = 'payment_orders'
          and slot_start = p_slot - interval '10 minutes'
          and completed = true) then
    raise exception 'SALES_SYNC_PREVIOUS_SLOT_INCOMPLETE';
  end if;
  if p_expected_cursor is null or length(btrim(p_expected_cursor)) = 0 then
    raise exception 'SALES_SYNC_EXPECTED_CURSOR_REQUIRED';
  end if;
  if (p_next_cursor is null) <> coalesce(p_completed, false) then
    raise exception 'SALES_SYNC_COMPLETION_MISMATCH';
  end if;
  select cursor_key into v_cursor from sales.sync_watermarks
   where source_name = 'payment_orders' for update;
  if not found then
    raise exception 'SALES_SYNC_WATERMARK_UNAVAILABLE';
  end if;
  select cursor_key, completed into v_slot_cursor, v_slot_completed
    from sales.sync_slots
   where source_name = 'payment_orders' and slot_start = p_slot for update;
  if coalesce(v_slot_completed, false) then
    raise exception 'SALES_SYNC_SLOT_ALREADY_COMPLETE';
  end if;
  if coalesce(v_slot_cursor, v_cursor) <> p_expected_cursor then
    raise exception 'SALES_SYNC_STALE_CURSOR';
  end if;
  if jsonb_typeof(p_events) is distinct from 'array' then
    raise exception 'SALES_SYNC_EVENTS_MUST_BE_ARRAY';
  end if;
  if p_next_cursor is not null and jsonb_array_length(p_events) = 0 then
    raise exception 'SALES_SYNC_EMPTY_ADVANCE_FORBIDDEN';
  end if;
  if p_next_cursor is not null
     and p_events->(jsonb_array_length(p_events) - 1)->>'source_cursor' is distinct from p_next_cursor then
    raise exception 'SALES_SYNC_CURSOR_EVENT_MISMATCH';
  end if;

  for v_event in select value from jsonb_array_elements(p_events) loop
    if jsonb_typeof(v_event) <> 'object'
       or coalesce(v_event->>'payment_order_id', '') = ''
       or coalesce(v_event->>'source_cursor', '') = ''
       or coalesce(v_event->>'amount_twd_cents', '') !~ '^[1-9][0-9]*$'
       or coalesce(v_event->>'customer_member_id', '') !~ '^[0-9a-fA-F-]{36}$'
       or coalesce(v_event->>'paid_at', '') = '' then
      raise exception 'SALES_SYNC_INVALID_EVENT';
    end if;
    v_customer := (v_event->>'customer_member_id')::uuid;
    v_paid_at := (v_event->>'paid_at')::timestamptz;
    v_amount := (v_event->>'amount_twd_cents')::bigint;

    select c.business_member_id, b.approved_at
      into v_biz, v_joined
      from sales.customer_attributions c
      join sales.business_members b on b.id = c.business_member_id
     where c.member_id = v_customer;

    if v_biz is null or v_paid_at < v_joined then
      -- Unattributed or pre-approval cash is never credited to a business member.
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into sales.performance_entries
      (source_name, payment_order_id, business_member_id, customer_member_id,
       amount_twd_cents, paid_at, business_day, source_cursor)
    values ('payment_orders', v_event->>'payment_order_id', v_biz, v_customer,
            v_amount, v_paid_at, (v_paid_at at time zone 'Asia/Taipei')::date,
            v_event->>'source_cursor')
    on conflict (source_name, payment_order_id) do update
      set source_cursor = excluded.source_cursor, updated_at = now()
      where sales.performance_entries.amount_twd_cents = excluded.amount_twd_cents
        and sales.performance_entries.business_member_id = excluded.business_member_id;
    if not found then
      raise exception 'SALES_SYNC_EVENT_CONFLICT';
    end if;
    v_inserted := v_inserted + 1;
  end loop;

  if p_next_cursor is not null then
    update sales.sync_watermarks set cursor_key = p_next_cursor, updated_at = now()
     where source_name = 'payment_orders';
  end if;
  insert into sales.sync_slots (source_name, slot_start, cursor_key, completed)
  values ('payment_orders', p_slot, coalesce(p_next_cursor, p_expected_cursor), coalesce(p_completed, false))
  on conflict (source_name, slot_start) do update
    set cursor_key = excluded.cursor_key, completed = excluded.completed, updated_at = now();

  if coalesce(p_completed, false) then
    delete from sales.sync_failures
     where source_name = 'payment_orders' and slot_start = p_slot;
  end if;

  return jsonb_build_object('slot', p_slot, 'completed', coalesce(p_completed,false),
    'accepted', v_inserted, 'skipped', v_skipped);
end;
$fn$;

create or replace function sales.publish_daily_performance(
  p_day date, p_actor uuid default null, p_actor_email text default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  v_day_start timestamptz;
  v_slots integer;
  v_gross bigint;
  v_reversed bigint;
  v_count integer;
begin
  if p_day is null then
    raise exception 'SALES_PUBLICATION_INVALID_DAY';
  end if;
  v_day_start := (p_day::timestamp at time zone 'Asia/Taipei');
  if now() < v_day_start + interval '5 hours' then
    raise exception 'SALES_PUBLICATION_TOO_EARLY';
  end if;
  select count(*) into v_slots from sales.sync_slots s
   where s.source_name = 'payment_orders' and s.completed
     and s.slot_start >= v_day_start + interval '3 hours'
     and s.slot_start <= v_day_start + interval '4 hours 50 minutes';
  if v_slots <> 12 then
    raise exception 'SALES_PUBLICATION_INCOMPLETE';
  end if;
  if exists (select 1 from sales.sync_failures f where f.business_day = p_day) then
    raise exception 'SALES_PUBLICATION_HAS_FAILURES';
  end if;
  select coalesce(sum(amount_twd_cents), 0), coalesce(sum(reversed_twd_cents), 0), count(*)
    into v_gross, v_reversed, v_count
    from sales.performance_entries where business_day = p_day;
  insert into sales.daily_publications
    (business_day, published_at, eligible_cents, reversed_cents, entry_count, published_by)
  values (p_day, now(), v_gross - v_reversed, v_reversed, v_count, p_actor)
  on conflict (business_day) do update
    set published_at = now(), eligible_cents = excluded.eligible_cents,
        reversed_cents = excluded.reversed_cents, entry_count = excluded.entry_count,
        published_by = excluded.published_by;
  perform sales.log_audit(p_actor, p_actor_email, 'sales.publication.publish',
    'sales.daily_publications', p_day::text,
    jsonb_build_object('eligibleCents', v_gross - v_reversed, 'entryCount', v_count));
  return jsonb_build_object('businessDay', p_day, 'eligibleCents', v_gross - v_reversed,
    'reversedCents', v_reversed, 'entryCount', v_count);
end;
$fn$;

create or replace function sales.record_refund_event(
  p_source_id text, p_original_order_id text, p_kind text, p_amount_twd_cents bigint,
  p_occurred_at timestamptz, p_verified boolean,
  p_actor uuid default null, p_actor_email text default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  v_order_amount bigint;
  v_verified_total bigint;
begin
  if p_kind not in ('refund','chargeback') then
    raise exception 'SALES_REFUND_INVALID_KIND';
  end if;
  if p_amount_twd_cents is null or p_amount_twd_cents <= 0 then
    raise exception 'SALES_REFUND_INVALID_AMOUNT';
  end if;
  select amount_twd_cents into v_order_amount from sales.performance_entries
   where payment_order_id = p_original_order_id;
  if v_order_amount is null then
    raise exception 'SALES_REFUND_UNKNOWN_ORDER';
  end if;
  insert into sales.refund_events
    (source_id, original_order_id, kind, amount_twd_cents, occurred_at, verified)
  values (p_source_id, p_original_order_id, p_kind, p_amount_twd_cents, p_occurred_at, coalesce(p_verified,false))
  on conflict (source_id) do nothing;
  if not found then
    raise exception 'SALES_REFUND_EVENT_EXISTS';
  end if;
  select coalesce(sum(amount_twd_cents), 0) into v_verified_total
    from sales.refund_events
   where original_order_id = p_original_order_id and verified = true;
  if v_verified_total > v_order_amount then
    raise exception 'SALES_REFUND_EXCEEDS_ORIGINAL';
  end if;
  update sales.performance_entries
     set reversed_twd_cents = v_verified_total
   where payment_order_id = p_original_order_id;
  perform sales.log_audit(p_actor, p_actor_email, 'sales.refund.record', 'sales.refund_events',
    p_source_id, jsonb_build_object('orderId', p_original_order_id, 'kind', p_kind,
      'amountCents', p_amount_twd_cents, 'verified', coalesce(p_verified,false)));
  return jsonb_build_object('sourceId', p_source_id, 'verifiedTotalCents', v_verified_total);
end;
$fn$;

-- ---------------------------------------------------------------- settlements
create or replace function sales.create_draft_settlement(
  p_period_month date, p_settings_version text, p_lines jsonb, p_cap_bps integer default 2000,
  p_actor uuid default null, p_actor_email text default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  v_end date;
  v_eligible bigint;
  v_total bigint := 0;
  v_line jsonb;
  v_id uuid;
  v_amount bigint;
  v_cap integer := coalesce(p_cap_bps, 2000);
begin
  if p_period_month is null or extract(day from p_period_month) <> 1 then
    raise exception 'SALES_SETTLEMENT_INVALID_MONTH';
  end if;
  if v_cap < 0 or v_cap > 2000 then
    raise exception 'SALES_SETTLEMENT_INVALID_CAP';
  end if;
  if not exists (select 1 from sales.commission_settings where version = p_settings_version) then
    raise exception 'SALES_SETTLEMENT_UNKNOWN_SETTINGS';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'SALES_SETTLEMENT_LINES_REQUIRED';
  end if;
  v_end := (p_period_month + interval '1 month')::date;
  select coalesce(sum(amount_twd_cents - reversed_twd_cents), 0) into v_eligible
    from sales.performance_entries
   where business_day >= p_period_month and business_day < v_end;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(v_line) <> 'object'
       or coalesce(v_line->>'beneficiaryBusinessId', '') !~ '^[0-9a-fA-F-]{36}$'
       or coalesce(v_line->>'category', '') not in ('personal','team','organization','leaderboard','campaign','other','adjustment')
       or length(btrim(coalesce(v_line->>'sourceKey', ''))) = 0
       or coalesce(v_line->>'amountCents', '') !~ '^-?[0-9]+$' then
      raise exception 'SALES_SETTLEMENT_INVALID_LINE';
    end if;
    v_amount := (v_line->>'amountCents')::bigint;
    if v_amount < 0 and (v_line->>'category') <> 'adjustment' then
      raise exception 'SALES_SETTLEMENT_NEGATIVE_LINE';
    end if;
    v_total := v_total + v_amount;
  end loop;
  if v_total < 0 then
    raise exception 'SALES_SETTLEMENT_NEGATIVE_TOTAL';
  end if;
  if v_total * 10000 > v_eligible * v_cap then
    raise exception 'TOTAL_BONUS_CAP_EXCEEDED';
  end if;
  insert into sales.settlements
    (period_month, eligible_topup_cents, bonus_cap_bps, settings_version, status, created_by)
  values (p_period_month, v_eligible, v_cap, p_settings_version, 'draft', p_actor)
  returning id into v_id;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    insert into sales.settlement_bonus_lines
      (settlement_id, beneficiary_business_id, category, source_key, amount_cents, basis)
    values (v_id, (v_line->>'beneficiaryBusinessId')::uuid, v_line->>'category',
            btrim(v_line->>'sourceKey'), (v_line->>'amountCents')::bigint,
            coalesce(v_line->'basis', '{}'::jsonb));
  end loop;
  perform sales.log_audit(p_actor, p_actor_email, 'sales.settlement.create', 'sales.settlements',
    v_id::text, jsonb_build_object('periodMonth', p_period_month, 'eligibleCents', v_eligible,
      'totalBonusCents', v_total, 'settingsVersion', p_settings_version));
  return jsonb_build_object('id', v_id, 'periodMonth', p_period_month,
    'eligibleTopupCents', v_eligible, 'totalBonusCents', v_total);
end;
$fn$;

create or replace function sales.approve_settlement(
  p_settlement_id uuid, p_actor uuid default null, p_actor_email text default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
begin
  update sales.settlements
     set status = 'approved', approved_at = now()
   where id = p_settlement_id and status = 'draft';
  if not found then
    raise exception 'INVALID_SETTLEMENT_TRANSITION';
  end if;
  perform sales.log_audit(p_actor, p_actor_email, 'sales.settlement.approve', 'sales.settlements',
    p_settlement_id::text, '{}'::jsonb);
  return jsonb_build_object('id', p_settlement_id, 'status', 'approved');
end;
$fn$;

create or replace function sales.record_settlement_payment(
  p_settlement_id uuid, p_beneficiary_business_id uuid, p_payment_reference text,
  p_paid_cents bigint, p_paid_at timestamptz,
  p_actor uuid default null, p_actor_email text default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
begin
  insert into sales.settlement_payment_records
    (settlement_id, beneficiary_business_id, payment_reference, paid_cents, paid_at, recorded_by)
  values (p_settlement_id, p_beneficiary_business_id, btrim(coalesce(p_payment_reference,'')),
          p_paid_cents, coalesce(p_paid_at, now()), p_actor);
  perform sales.log_audit(p_actor, p_actor_email, 'sales.settlement.payment', 'sales.settlement_payment_records',
    p_settlement_id::text, jsonb_build_object('beneficiary', p_beneficiary_business_id,
      'paidCents', p_paid_cents, 'reference', p_payment_reference));
  return jsonb_build_object('settlementId', p_settlement_id, 'status', 'recorded');
end;
$fn$;

create or replace function sales.mark_settlement_paid(
  p_settlement_id uuid, p_actor uuid default null, p_actor_email text default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
begin
  update sales.settlements
     set status = 'paid', paid_at = now()
   where id = p_settlement_id and status = 'approved';
  if not found then
    raise exception 'INVALID_SETTLEMENT_TRANSITION';
  end if;
  perform sales.log_audit(p_actor, p_actor_email, 'sales.settlement.paid', 'sales.settlements',
    p_settlement_id::text, '{}'::jsonb);
  return jsonb_build_object('id', p_settlement_id, 'status', 'paid');
end;
$fn$;

create or replace function sales.record_adjustment(
  p_settlement_id uuid, p_beneficiary_business_id uuid, p_source_key text,
  p_amount_delta_cents bigint, p_reason text,
  p_actor uuid default null, p_actor_email text default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  v_id uuid;
begin
  insert into sales.settlement_adjustments
    (settlement_id, beneficiary_business_id, source_key, amount_delta_cents, reason, recorded_by)
  values (p_settlement_id, p_beneficiary_business_id, btrim(coalesce(p_source_key,'')),
          p_amount_delta_cents, btrim(coalesce(p_reason,'')), p_actor)
  returning id into v_id;
  perform sales.log_audit(p_actor, p_actor_email, 'sales.settlement.adjustment', 'sales.settlement_adjustments',
    v_id::text, jsonb_build_object('settlementId', p_settlement_id,
      'beneficiary', p_beneficiary_business_id, 'deltaCents', p_amount_delta_cents));
  return jsonb_build_object('id', v_id);
end;
$fn$;

-- ---------------------------------------------------------------- provider observations
create or replace function sales.commit_provider_observation_page(
  p_environment text, p_expected_cursor text, p_next_cursor text, p_rows jsonb
) returns void language plpgsql security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  v_cursor text;
  v_row jsonb;
begin
  select cursor_key into v_cursor from sales.provider_observation_checkpoints
   where environment = p_environment for update;
  if not found or v_cursor is distinct from p_expected_cursor then
    raise exception 'SALES_OBSERVATION_STALE_CURSOR';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array'
     or jsonb_array_length(p_rows) not between 1 and 100
     or p_next_cursor is null or btrim(p_next_cursor) = ''
     or p_next_cursor = p_expected_cursor then
    raise exception 'SALES_OBSERVATION_INVALID_PAGE';
  end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if v_row->>'environment' is distinct from p_environment then
      raise exception 'SALES_OBSERVATION_ENVIRONMENT_MISMATCH';
    end if;
    insert into sales.provider_trade_observations (
      environment, payment_order_id, merchant_order_no, trade_no, amount_twd,
      observed_at, source_updated_at, trade_status, payment_type, pay_time,
      expected_fund_time, close_status, close_amount, back_status, back_balance
    ) values (
      p_environment, v_row->>'payment_order_id', v_row->>'merchant_order_no',
      v_row->>'trade_no', (v_row->>'amount_twd')::bigint,
      (v_row->>'observed_at')::timestamptz, (v_row->>'source_updated_at')::timestamptz,
      v_row->>'trade_status', v_row->>'payment_type', v_row->>'pay_time',
      v_row->>'expected_fund_time', v_row->>'close_status', v_row->>'close_amount',
      v_row->>'back_status', v_row->>'back_balance'
    );
  end loop;
  update sales.provider_observation_checkpoints set cursor_key = p_next_cursor
   where environment = p_environment;
end;
$fn$;

create or replace function sales.complete_provider_observation_slot(
  p_environment text, p_slot timestamptz, p_cursor text
) returns void language plpgsql security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  v_cursor text;
begin
  if p_slot is null
     or (p_slot at time zone 'Asia/Taipei')::time not between time '03:00' and time '04:50'
     or extract(minute from p_slot at time zone 'Asia/Taipei')::integer % 10 <> 0
     or extract(second from p_slot at time zone 'Asia/Taipei') <> 0 then
    raise exception 'SALES_OBSERVATION_INVALID_SLOT';
  end if;
  select cursor_key into v_cursor from sales.provider_observation_checkpoints
   where environment = p_environment for update;
  if not found or v_cursor is distinct from p_cursor then
    raise exception 'SALES_OBSERVATION_STALE_CURSOR';
  end if;
  if (p_slot at time zone 'Asia/Taipei')::time > time '03:00'
     and not exists (
       select 1 from sales.provider_observation_slots
        where environment = p_environment and slot_start = p_slot - interval '10 minutes') then
    raise exception 'SALES_OBSERVATION_PREVIOUS_SLOT_INCOMPLETE';
  end if;
  insert into sales.provider_observation_slots (environment, slot_start, cursor_key)
  values (p_environment, p_slot, p_cursor)
  on conflict do nothing;
end;
$fn$;

-- ---------------------------------------------------------------- RLS
alter table sales.applications enable row level security;
alter table sales.business_members enable row level security;
alter table sales.attributions enable row level security;
alter table sales.attribution_events enable row level security;
alter table sales.customer_attributions enable row level security;
alter table sales.commission_settings enable row level security;
alter table sales.performance_entries enable row level security;
alter table sales.refund_events enable row level security;
alter table sales.settlements enable row level security;
alter table sales.settlement_bonus_lines enable row level security;
alter table sales.settlement_adjustments enable row level security;
alter table sales.settlement_payment_records enable row level security;
alter table sales.bulletins enable row level security;
alter table sales.bulletin_revisions enable row level security;
alter table sales.admin_audit enable row level security;
alter table sales.sync_watermarks enable row level security;
alter table sales.sync_slots enable row level security;
alter table sales.sync_failures enable row level security;
alter table sales.daily_publications enable row level security;
alter table sales.provider_observation_checkpoints enable row level security;
alter table sales.provider_trade_observations enable row level security;
alter table sales.provider_observation_slots enable row level security;

drop policy if exists sales_applications_self_read on sales.applications;
create policy sales_applications_self_read on sales.applications
  for select to authenticated using (member_id = auth.uid());

drop policy if exists sales_business_members_self_read on sales.business_members;
create policy sales_business_members_self_read on sales.business_members
  for select to authenticated using (member_id = auth.uid());

drop policy if exists sales_attributions_read on sales.attributions;
create policy sales_attributions_read on sales.attributions
  for select to authenticated using (
    introducer_member_id = auth.uid()
    or exists (select 1 from sales.applications a
                where a.id = attributions.application_id and a.member_id = auth.uid())
  );

drop policy if exists sales_attribution_events_read on sales.attribution_events;
create policy sales_attribution_events_read on sales.attribution_events
  for select to authenticated using (
    exists (select 1 from sales.applications a
             where a.id = attribution_events.application_id and a.member_id = auth.uid())
    or exists (select 1 from sales.attributions at
                where at.application_id = attribution_events.application_id
                  and at.introducer_member_id = auth.uid())
  );

drop policy if exists sales_customer_attributions_read on sales.customer_attributions;
create policy sales_customer_attributions_read on sales.customer_attributions
  for select to authenticated using (
    member_id = auth.uid() or business_member_id = sales.current_business_id()
  );

drop policy if exists sales_performance_entries_read on sales.performance_entries;
create policy sales_performance_entries_read on sales.performance_entries
  for select to authenticated using (business_member_id = sales.current_business_id());

drop policy if exists sales_settlements_read on sales.settlements;
create policy sales_settlements_read on sales.settlements
  for select to authenticated using (sales.owns_settlement(id));

drop policy if exists sales_settlement_lines_read on sales.settlement_bonus_lines;
create policy sales_settlement_lines_read on sales.settlement_bonus_lines
  for select to authenticated using (beneficiary_business_id = sales.current_business_id());

drop policy if exists sales_settlement_payments_read on sales.settlement_payment_records;
create policy sales_settlement_payments_read on sales.settlement_payment_records
  for select to authenticated using (beneficiary_business_id = sales.current_business_id());

drop policy if exists sales_settlement_adjustments_read on sales.settlement_adjustments;
create policy sales_settlement_adjustments_read on sales.settlement_adjustments
  for select to authenticated using (beneficiary_business_id = sales.current_business_id());

drop policy if exists sales_bulletins_public_read on sales.bulletins;
create policy sales_bulletins_public_read on sales.bulletins
  for select to authenticated using (
    status = 'published' and withdrawn_at is null and published_at <= now()
  );

-- ---------------------------------------------------------------- privileges
revoke all on all tables in schema sales from public;
revoke all on all sequences in schema sales from public;
revoke all on all functions in schema sales from public;
do $grants$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema sales from anon';
    execute 'revoke all on all functions in schema sales from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema sales from authenticated';
    execute 'revoke all on all functions in schema sales from authenticated';
    execute 'grant usage on schema sales to authenticated';
    execute 'grant select on sales.applications, sales.business_members, sales.attributions, sales.attribution_events, sales.customer_attributions, sales.performance_entries, sales.settlements, sales.settlement_bonus_lines, sales.settlement_payment_records, sales.settlement_adjustments, sales.bulletins to authenticated';
    execute 'grant execute on function sales.current_business_id(), sales.owns_settlement(uuid), sales.member_overview(), sales.member_performance(date), sales.member_commissions(), sales.member_bulletins(), sales.my_referral_info(), sales.submit_my_application(text, boolean, boolean), sales.confirm_my_attribution(uuid), sales.bind_my_referral(text) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema sales to service_role';
    execute 'grant all on all tables in schema sales to service_role';
    execute 'grant all on all sequences in schema sales to service_role';
    execute 'grant execute on all functions in schema sales to service_role';
  end if;
end;
$grants$;

commit;
