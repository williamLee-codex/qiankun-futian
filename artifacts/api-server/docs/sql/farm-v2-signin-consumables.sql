-- Server-owned usable-item balances. Consumption will require an independently
-- verified farm action; never expose direct client decrement privileges.
create table if not exists public.farm_v2_consumable_balances(
 user_id text not null references public.farm_v2_player_state(user_id),
 item_id text not null check(item_id in
 ('instant_harvest','double_harvest','farm_protection_1h','yellow_upgrade','mystic_upgrade')),
 quantity integer not null default 0 check(quantity>=0),
 updated_at timestamptz not null default now(),
 primary key(user_id,item_id)
);
create table if not exists public.farm_v2_consumable_ledger(
 id uuid primary key default gen_random_uuid(),
 user_id text not null,
 item_id text not null,
 quantity integer not null check(quantity<>0),
 source_type text not null,
 source_key text not null,
 created_at timestamptz not null default now(),
 unique(user_id,source_type,source_key,item_id),
 foreign key(user_id,item_id) references public.farm_v2_consumable_balances(user_id,item_id)
);
alter table public.farm_v2_consumable_balances enable row level security;
alter table public.farm_v2_consumable_ledger enable row level security;
revoke all on public.farm_v2_consumable_balances,public.farm_v2_consumable_ledger from public,anon,authenticated;
create or replace function public.farm_v2_signin_claim_consumable_day(
 p_user_id text,p_cycle_number integer,p_cycle_day integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 v_cycle public.farm_v2_signin_cycles%rowtype;
 v_today date:=(now() at time zone 'Asia/Taipei')::date;
 v_item text;
 v_qty integer;
 v_receipt uuid;
begin
 v_item:=case when p_cycle_day in (3,13) then 'instant_harvest'
 when p_cycle_day in (5,14,23) then 'double_harvest'
 when p_cycle_day in (8,18,28) then 'farm_protection_1h'
 when p_cycle_day=9 then 'yellow_upgrade'
 when p_cycle_day in (19,26) then 'mystic_upgrade' end;
 v_qty:=case p_cycle_day when 3 then 1 when 5 then 1 when 8 then 2 when 9 then 1
 when 13 then 2 when 14 then 2 when 18 then 3 when 19 then 1 when 23 then 3
 when 26 then 1 when 28 then 5 end;
 if v_item is null then return jsonb_build_object('status','unsupported_reward'); end if;
 select * into v_cycle from public.farm_v2_signin_cycles
 where user_id=p_user_id and cycle_number=p_cycle_number for update;
 if not found then return jsonb_build_object('status','cycle_not_found'); end if;
 if v_today-v_cycle.cycle_start_day+1<>p_cycle_day then
 return jsonb_build_object('status','not_today'); end if;
 if exists(select 1 from public.farm_v2_signin_days where user_id=p_user_id
 and cycle_number=p_cycle_number and cycle_day=p_cycle_day) then
 return jsonb_build_object('status','already_signed'); end if;
 if not exists(select 1 from public.farm_v2_player_state where user_id=p_user_id)
 then return jsonb_build_object('status','player_not_found'); end if;
 insert into public.farm_v2_consumable_balances(user_id,item_id,quantity)
 values(p_user_id,v_item,0) on conflict do nothing;
 update public.farm_v2_consumable_balances
 set quantity=quantity+v_qty,updated_at=now()
 where user_id=p_user_id and item_id=v_item and quantity<=2147483647-v_qty;
 if not found then return jsonb_build_object('status','inventory_overflow'); end if;
 insert into public.farm_v2_consumable_ledger(user_id,item_id,quantity,source_type,source_key)
 values(p_user_id,v_item,v_qty,'signin',p_cycle_number::text||':'||p_cycle_day)
 returning id into v_receipt;
 insert into public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup,reward_transaction_id)
 values(p_user_id,p_cycle_number,p_cycle_day,false,v_receipt);
 return jsonb_build_object('status','claimed','cycleDay',p_cycle_day,
 'item',v_item,'quantity',v_qty,'transactionId',v_receipt);
end; $$;
revoke all on function public.farm_v2_signin_claim_consumable_day(text,integer,integer) from public,anon,authenticated;
