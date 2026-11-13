-- Exercise the platform's sign-in read chain with its actual database role.
-- No persistent player data or awards are retained.
begin;
set local role service_role;
do $test$
declare
 v_user text;
 v_init jsonb;
 v_status jsonb;
 v_inventory jsonb;
 v_pending integer;
begin
 select user_id into v_user from public.farm_v2_player_state limit 1;
 if v_user is null then raise exception 'TEST_SETUP: no farm player'; end if;
 v_init:=public.farm_v2_signin_initialize(v_user);
 if v_init->>'status'<>'ready' then
  raise exception 'SIGNIN_INIT_NOT_READY: %',v_init;
 end if;
 v_status:=public.farm_v2_signin_status(v_user);
 if v_status->>'status'<>'ready'
  or (v_status->>'cycleNumber')::integer<>(v_init->>'cycleNumber')::integer
 then raise exception 'SIGNIN_STATUS_MISMATCH: %, %',v_init,v_status; end if;
 v_pending:=public.farm_v2_signin_pending_perfect_cycle(v_user);
 v_inventory:=public.farm_v2_consumable_inventory(v_user);
 if v_inventory is null or
   (select count(*) from jsonb_object_keys(v_inventory))<>5
 then raise exception 'SIGNIN_INVENTORY_INVALID: %',v_inventory; end if;
 if (select count(*) from jsonb_each_text(v_inventory)
   where value::integer<0)<>0
 then raise exception 'SIGNIN_NEGATIVE_INVENTORY: %',v_inventory; end if;
end;
$test$;
rollback;
