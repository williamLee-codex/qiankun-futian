-- Perfect-attendance award: one badge, 3 crystals, 200 coins,
-- 2 spirit sand, 2 jade marrow. One atomic transaction per cycle.
create table if not exists public.farm_v2_signin_perfect_badges(
 user_id text not null,cycle_number integer not null,
 awarded_at timestamptz not null default now(),
 primary key(user_id,cycle_number),
 foreign key(user_id,cycle_number) references public.farm_v2_signin_cycles(user_id,cycle_number)
);
alter table public.farm_v2_signin_perfect_badges enable row level security;
revoke all on public.farm_v2_signin_perfect_badges from public,anon,authenticated;
create or replace function public.farm_v2_signin_claim_perfect(
 p_user_id text,p_cycle_number integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 v_cycle public.farm_v2_signin_cycles%rowtype;
 v_owner uuid;
 v_count integer;
 v_state jsonb;
 v_materials jsonb;
 v_sand integer;
 v_jade integer;
 v_coin jsonb;
 v_crystal jsonb;
begin
 select * into v_cycle from public.farm_v2_signin_cycles
 where user_id=p_user_id and cycle_number=p_cycle_number for update;
 if not found then return jsonb_build_object('status','cycle_not_found'); end if;
 if v_cycle.perfect_reward_claimed_at is not null then
  return jsonb_build_object('status','already_claimed'); end if;
 select count(*) into v_count from public.farm_v2_signin_days
 where user_id=p_user_id and cycle_number=p_cycle_number;
 if v_count<>30 then return jsonb_build_object('status','incomplete','signedDays',v_count); end if;
 v_owner:=public.farm_v2_resolve_verified_wallet_owner(p_user_id);
 if v_owner is null then return jsonb_build_object('status','unverified_identity'); end if;
 select warehouse_state into v_state from public.farm_v2_player_state where user_id=p_user_id for update;
 if not found then return jsonb_build_object('status','player_not_found'); end if;
 v_materials:=v_state#>'{workshop,materials}';
 if jsonb_typeof(v_materials)<>'object'
 or (v_materials ? '蘊靈砂' and jsonb_typeof(v_materials->'蘊靈砂')<>'number')
 or (v_materials ? '九霄玉髓' and jsonb_typeof(v_materials->'九霄玉髓')<>'number')
 then return jsonb_build_object('status','invalid_inventory'); end if;
 v_sand:=coalesce((v_materials->>'蘊靈砂')::integer,0);
 v_jade:=coalesce((v_materials->>'九霄玉髓')::integer,0);
 if v_sand<0 or v_jade<0 or v_sand>2147483645 or v_jade>2147483645
 then return jsonb_build_object('status','invalid_inventory'); end if;
 v_coin:=public.core_wallet_apply_transaction(v_owner,200,'coin','credit',
 'farm-v2:signin:perfect:'||p_user_id||':'||p_cycle_number||':coin',
 'farm_v2_signin_perfect',p_cycle_number::text,'farm_v2_signin',null);
 if v_coin->>'result_status' not in ('created','duplicate')
 or nullif(v_coin#>>'{transaction,id}','') is null then
  raise exception 'PERFECT_COIN_LEDGER_FAILED'; end if;
 v_crystal:=public.core_wallet_apply_transaction(v_owner,3,'crystal','credit',
 'farm-v2:signin:perfect:'||p_user_id||':'||p_cycle_number||':crystal',
 'farm_v2_signin_perfect',p_cycle_number::text,'farm_v2_signin',null);
 if v_crystal->>'result_status' not in ('created','duplicate')
 or nullif(v_crystal#>>'{transaction,id}','') is null then
  raise exception 'PERFECT_CRYSTAL_LEDGER_FAILED'; end if;
 update public.farm_v2_player_state set warehouse_state=
 jsonb_set(jsonb_set(v_state,'{workshop,materials,蘊靈砂}',to_jsonb(v_sand+2),true),
 '{workshop,materials,九霄玉髓}',to_jsonb(v_jade+2),true),updated_at=now()
 where user_id=p_user_id;
 insert into public.farm_v2_signin_perfect_badges(user_id,cycle_number)
 values(p_user_id,p_cycle_number);
 update public.farm_v2_signin_cycles set perfect_reward_claimed_at=now()
 where user_id=p_user_id and cycle_number=p_cycle_number;
 return jsonb_build_object('status','claimed','badge',1,'coins',200,'crystals',3,
 '蘊靈砂',2,'九霄玉髓',2);
end; $$;
revoke all on function public.farm_v2_signin_claim_perfect(text,integer) from public,anon,authenticated;
