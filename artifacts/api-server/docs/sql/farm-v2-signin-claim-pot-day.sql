-- Sign-in pot rewards go to workshop.pots, never the crop warehouse.
create or replace function public.farm_v2_signin_claim_pot_day(
 p_user_id text,p_cycle_number integer,p_cycle_day integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 v_cycle public.farm_v2_signin_cycles%rowtype;
 v_today date:=((now() at time zone 'Asia/Taipei') - interval '5 hours')::date;
 v_grade text;
 v_state jsonb;
 v_pots jsonb;
 v_id uuid:=gen_random_uuid();
 v_species integer;
 v_pot jsonb;
begin
 v_grade:=case p_cycle_day when 15 then '黃' when 20 then '玄' when 30 then '地' else null end;
 if v_grade is null then return jsonb_build_object('status','unsupported_reward'); end if;
 select * into v_cycle from public.farm_v2_signin_cycles
 where user_id=p_user_id and cycle_number=p_cycle_number for update;
 if not found then return jsonb_build_object('status','cycle_not_found'); end if;
 if v_today-v_cycle.cycle_start_day+1<>p_cycle_day then return jsonb_build_object('status','not_today'); end if;
 if exists(select 1 from public.farm_v2_signin_days where user_id=p_user_id and cycle_number=p_cycle_number and cycle_day=p_cycle_day)
 then return jsonb_build_object('status','already_signed'); end if;
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
 values(p_user_id,p_cycle_number,p_cycle_day,false,v_id);
 return jsonb_build_object('status','claimed','cycleDay',p_cycle_day,'pot',v_pot);
end; $$;
revoke all on function public.farm_v2_signin_claim_pot_day(text,integer,integer) from public,anon,authenticated;
