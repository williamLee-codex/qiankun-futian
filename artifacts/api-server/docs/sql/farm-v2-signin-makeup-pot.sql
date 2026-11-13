-- Atomic makeup of pot sign-in days; chronological, once per earned credit.
create or replace function public.farm_v2_signin_makeup_pot_day(
 p_user_id text,p_cycle_number integer,p_cycle_day integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 v_cycle public.farm_v2_signin_cycles%rowtype;
 v_today date:=(now() at time zone 'Asia/Taipei')::date;
 v_current integer;
 v_granted integer;
 v_used integer;
 v_grade text;
 v_state jsonb;
 v_pots jsonb;
 v_id uuid:=gen_random_uuid();
 v_species integer;
 v_pot jsonb;
begin
 v_grade:=case p_cycle_day when 15 then '黃' when 20 then '玄' when 30 then '地' else null end;
 if v_grade is null then return jsonb_build_object('status','unsupported_reward'); end if; end if;
 select * into v_cycle from public.farm_v2_signin_cycles
  where user_id=p_user_id and cycle_number=p_cycle_number for update;
 if not found then return jsonb_build_object('status','cycle_not_found'); end if;
 v_current:=v_today-v_cycle.cycle_start_day+1;
 if v_current not between 1 and 30 then return jsonb_build_object('status','cycle_inactive'); end if;
 if p_cycle_day>=v_current then return jsonb_build_object('status','not_past_day'); end if;
 if exists(select 1 from public.farm_v2_signin_days where user_id=p_user_id
  and cycle_number=p_cycle_number and cycle_day=p_cycle_day) then
  return jsonb_build_object('status','already_signed'); end if;
 select count(*) into v_granted from public.farm_v2_signin_makeup_grants
  where user_id=p_user_id and cycle_number=p_cycle_number and grant_day<=v_current;
 select count(*) into v_used from public.farm_v2_signin_days
  where user_id=p_user_id and cycle_number=p_cycle_number and is_makeup;
 if v_used>=v_granted then return jsonb_build_object('status','no_makeup_credit'); end if;
 if exists(select 1 from pg_catalog.generate_series(1,p_cycle_day-1) as d
  where not exists(select 1 from public.farm_v2_signin_days s
   where s.user_id=p_user_id and s.cycle_number=p_cycle_number and s.cycle_day=d)) then
  return jsonb_build_object('status','earlier_day_missing'); end if;
 select warehouse_state into v_state from public.farm_v2_player_state where user_id=p_user_id for update;
 if not found then return jsonb_build_object('status','player_not_found'); end if;
 v_pots:=v_state #> '{workshop,pots}';
 if jsonb_typeof(v_pots)<>'array' then return jsonb_build_object('status','invalid_workshop'); end if;
 v_species:=1+floor(random()*6)::integer;
 v_pot:=jsonb_build_object('id',v_id,'grade',v_grade,'species',v_species,
   'displayed',false,'acquiredAt',floor(extract(epoch from clock_timestamp())*1000)::bigint);
 update public.farm_v2_player_state
 set warehouse_state=jsonb_set(v_state,'{workshop,pots}',v_pots||jsonb_build_array(v_pot),false),
 updated_at=now() where user_id=p_user_id;
 insert into public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup,reward_transaction_id)
 values(p_user_id,p_cycle_number,p_cycle_day,true,v_id);
 return jsonb_build_object('status','claimed','isMakeup',true,'cycleDay',p_cycle_day,'pot',v_pot,'makeupCreditsRemaining',v_granted-v_used-1);
end; $$;
revoke all on function public.farm_v2_signin_makeup_pot_day(text,integer,integer) from public,anon,authenticated;
