-- Authoritative daily activity. Apply as the existing privileged Farm schema owner.
-- No existing mission/inventory rows are rewritten; only successful future journals count.
BEGIN;
CREATE TABLE public.farm_v2_activity_day (
 user_id text NOT NULL REFERENCES public.farm_v2_player_state(user_id),
 day date NOT NULL, tasks jsonb NOT NULL CHECK(jsonb_typeof(tasks)='array' AND jsonb_array_length(tasks)=6),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(user_id,day)
);
CREATE TABLE public.farm_v2_activity_event (
 user_id text NOT NULL, day date NOT NULL, transaction_id text NOT NULL,
 event_type text NOT NULL CHECK(event_type IN ('plant','harvest','buy_seeds','synthesize','display_pot','inspect_warehouse','feed_pet','inspect_pet','interact_friend','visit_friend')),
 quantity integer NOT NULL CHECK(quantity>0), species integer CHECK(species BETWEEN 1 AND 6),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,day,transaction_id,event_type),
 FOREIGN KEY(user_id,day) REFERENCES public.farm_v2_activity_day(user_id,day)
);
CREATE TABLE public.farm_v2_activity_claim (
 user_id text NOT NULL, day date NOT NULL, milestone integer NOT NULL CHECK(milestone IN(30,60,100)),
 reward jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,day,milestone), FOREIGN KEY(user_id,day) REFERENCES public.farm_v2_activity_day(user_id,day)
);
ALTER TABLE public.farm_v2_activity_day ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_v2_activity_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_v2_activity_claim ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.farm_v2_activity_day,public.farm_v2_activity_event,public.farm_v2_activity_claim FROM PUBLIC,anon,authenticated,farm_v2_runtime;

CREATE FUNCTION public.farm_v2_activity_day_key(p_now timestamptz DEFAULT statement_timestamp()) RETURNS date
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT ((p_now AT TIME ZONE 'Asia/Taipei')-interval '5 hours')::date
$$;

-- Snapshot assignment under the same player lock used by all gameplay mutations.
CREATE FUNCTION public.farm_v2_activity_ensure_day(p_user_id text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d date := public.farm_v2_activity_day_key(); p public.farm_v2_player_state%ROWTYPE;
 ids text[] := '{}'; candidate record; grp text; groups text[] := '{}'; clicks integer:=0;
 owned boolean; feedable boolean; can_synth boolean; can_display boolean; unlocked integer; can_visit boolean; can_interact boolean;
 candidates jsonb; selected jsonb := '[]';
BEGIN
 SELECT * INTO p FROM public.farm_v2_player_state WHERE user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FARM_PLAYER_STATE_NOT_FOUND'; END IF;
 IF EXISTS(SELECT 1 FROM public.farm_v2_activity_day WHERE user_id=p_user_id AND day=d) THEN RETURN; END IF;
 SELECT count(*) INTO unlocked FROM public.farm_v2_land WHERE user_id=p_user_id AND access_active;
 owned := EXISTS(SELECT 1 FROM jsonb_array_elements_text(COALESCE(p.pet_state->'owned','[]')) pet WHERE pet IN('尋星犬','辟邪狻猊')) OR p.effective_paid_crystals>=450;
 -- Exact pet food costs: dog1, lion2, milestone pets3/4. Require currently sufficient food.
 SELECT EXISTS(SELECT 1 FROM jsonb_array_elements_text(COALESCE(p.pet_state->'owned','[]')) pet
   WHERE (pet='尋星犬' AND COALESCE((p.warehouse_state#>>'{workshop,petFood}')::integer,0)>=1)
      OR (pet='辟邪狻猊' AND COALESCE((p.warehouse_state#>>'{workshop,petFood}')::integer,0)>=2))
   OR (p.effective_paid_crystals>=450 AND COALESCE((p.warehouse_state#>>'{workshop,petFood}')::integer,0)>=3) INTO feedable;
 can_display := EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(p.warehouse_state#>'{workshop,pots}','[]')) x WHERE NOT COALESCE((x->>'displayed')::boolean,false));
 -- Yellow synthesis needs3 same species crops +1 sand; coins remain ordinary gameplay cost.
 can_synth := EXISTS(SELECT 1 FROM farm_v2_bank.wallets b WHERE b.user_id::text=p_user_id AND b.balance>=3) AND COALESCE((p.warehouse_state#>>'{workshop,materials,蘊靈砂}')::integer,0)>=1
   AND EXISTS(SELECT 1 FROM jsonb_each_text(COALESCE(p.warehouse_state->'crops','{}')) x WHERE x.key~'^[1-6]$' AND x.value::integer>=3);
 SELECT EXISTS(SELECT 1 FROM public.platform_friendships f
 JOIN public.farm_v2_player_state fp ON fp.user_id=(CASE WHEN f.user_a_id::text=p_user_id THEN f.user_b_id ELSE f.user_a_id END)::text
 WHERE (f.user_a_id::text=p_user_id OR f.user_b_id::text=p_user_id) AND f.status='active' AND f.blocked_by_user_id IS NULL
 AND public.farm_v2_resolve_verified_wallet_owner(fp.user_id) IS NOT NULL) INTO can_visit;
 SELECT EXISTS(SELECT 1 FROM public.platform_friendships f
 JOIN public.farm_v2_player_state fp ON fp.user_id=(CASE WHEN f.user_a_id::text=p_user_id THEN f.user_b_id ELSE f.user_a_id END)::text
 JOIN public.farm_v2_land fl ON fl.user_id=(CASE WHEN f.user_a_id::text=p_user_id THEN f.user_b_id ELSE f.user_a_id END)::text
 WHERE (f.user_a_id::text=p_user_id OR f.user_b_id::text=p_user_id) AND f.status='active' AND f.blocked_by_user_id IS NULL
 AND fl.access_active AND fl.land_id BETWEEN 2 AND 5 AND fl.lifecycle='MATURE'
 AND fp.first_farm_entered_at IS NOT NULL AND fp.effective_paid_crystals<999
 AND (fl.land_id<4 OR fp.effective_paid_crystals>=CASE fl.land_id WHEN 4 THEN 100 ELSE 300 END)
 AND COALESCE((p.warehouse_state#>>'{workshop,friendInteractions,assistSuccessCount}')::integer,0)<5
 AND COALESCE((p.warehouse_state#>>ARRAY['workshop','friendInteractions','assistCooldownUntilByFriend',fl.user_id])::bigint,0)<=extract(epoch FROM clock_timestamp())*1000
 AND public.farm_v2_resolve_verified_wallet_owner(fl.user_id) IS NOT NULL) INTO can_interact;
 candidates := jsonb_build_array(
   jsonb_build_object('id','plant_once','label','種植一次','target',1,'event','plant','mode','occurrences','group','plant_once'),
   jsonb_build_object('id','plant_5','label','種植5株','target',5,'event','plant','group','plant_qty'),
   jsonb_build_object('id','plant_10','label','種植10株','target',10,'event','plant','group','plant_qty'),
   jsonb_build_object('id','harvest_5','label','收穫5株','target',5,'event','harvest','group','harvest_qty'),
   jsonb_build_object('id','harvest_10','label','收穫10株','target',10,'event','harvest','group','harvest_qty'),
   jsonb_build_object('id','buy_seeds_once','label','購買種子一次','target',1,'event','buy_seeds','mode','occurrences','group','buy_once'),
   jsonb_build_object('id','buy_5','label','購買5顆種子','target',5,'event','buy_seeds','group','buy_qty'),
   jsonb_build_object('id','buy_10','label','購買10顆種子','target',10,'event','buy_seeds','group','buy_qty'),
   jsonb_build_object('id','inspect_warehouse','label','查看倉庫','target',1,'event','inspect_warehouse','group','click','click',true));
 IF can_synth THEN candidates := candidates||jsonb_build_array(jsonb_build_object('id','synthesize_once','label','合成盆栽一次','target',1,'event','synthesize','group','synthesize')); END IF;
 IF can_display THEN candidates := candidates||jsonb_build_array(jsonb_build_object('id','display_pot_once','label','擺放或更換盆栽一次','target',1,'event','display_pot','group','display')); END IF;
 IF feedable THEN candidates := candidates||jsonb_build_array(jsonb_build_object('id','feed_pet_once','label','餵養靈獸一次','target',1,'event','feed_pet','group','feed')); END IF;
 IF owned THEN candidates := candidates||jsonb_build_array(jsonb_build_object('id','inspect_pet','label','查看靈獸','target',1,'event','inspect_pet','group','click','click',true)); END IF;
 IF can_visit THEN candidates := candidates||jsonb_build_array(jsonb_build_object('id','visit_friend_once','label','拜訪好友一次','target',1,'event','visit_friend','group','visit')); END IF;
 IF can_interact THEN candidates := candidates||jsonb_build_array(jsonb_build_object('id','interact_friend_once','label','與好友互動一次','target',1,'event','interact_friend','group','interact')); END IF;
 IF unlocked>=2 THEN candidates := candidates||jsonb_build_array(
   jsonb_build_object('id','plant_two_species','label','種植兩種作物','target',2,'event','plant','mode','species','group','plant_species'),
   jsonb_build_object('id','harvest_two_species','label','收穫兩種作物','target',2,'event','harvest','mode','species','group','harvest_species')); END IF;
 -- Greedy over conflict groups always has the six independent base groups available.
 FOR candidate IN SELECT x FROM jsonb_array_elements(candidates) x ORDER BY md5(p_user_id||':'||d::text||':'||(x->>'id')),x->>'id' LOOP
   grp:=candidate.x->>'group';
   IF grp=ANY(groups) THEN CONTINUE; END IF;
   groups:=array_append(groups,grp); selected:=selected||jsonb_build_array(candidate.x);
   EXIT WHEN jsonb_array_length(selected)=6;
 END LOOP;
 IF jsonb_array_length(selected)<>6 THEN RAISE EXCEPTION 'ACTIVITY_ASSIGNMENT_INCOMPLETE'; END IF;
 INSERT INTO public.farm_v2_activity_day(user_id,day,tasks) VALUES(p_user_id,d,selected);
END $$;

CREATE FUNCTION public.farm_v2_record_activity_event(p_user_id text,p_transaction_id text,p_event_type text,p_quantity integer,p_species integer DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF public.farm_v2_resolve_verified_wallet_owner(p_user_id) IS NULL THEN RETURN; END IF;
 IF p_quantity IS NULL OR p_quantity<=0 OR p_transaction_id IS NULL OR length(p_transaction_id)=0 THEN RAISE EXCEPTION 'INVALID_ACTIVITY_EVENT'; END IF;
 PERFORM public.farm_v2_activity_ensure_day(p_user_id);
 INSERT INTO public.farm_v2_activity_event(user_id,day,transaction_id,event_type,quantity,species)
 VALUES(p_user_id,public.farm_v2_activity_day_key(),p_transaction_id,p_event_type,p_quantity,p_species) ON CONFLICT DO NOTHING;
END $$;

CREATE FUNCTION public.farm_v2_activity_summary(p_user_id text,p_status text DEFAULT 'ready') RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 WITH task_progress AS (
 SELECT t.x,LEAST((t.x->>'target')::bigint,CASE t.x->>'mode'
 WHEN 'species' THEN (SELECT count(DISTINCT e.species) FROM public.farm_v2_activity_event e WHERE e.user_id=d.user_id AND e.day=d.day AND e.event_type=t.x->>'event')
 WHEN 'occurrences' THEN (SELECT count(*) FROM public.farm_v2_activity_event e WHERE e.user_id=d.user_id AND e.day=d.day AND e.event_type=t.x->>'event')
 ELSE COALESCE((SELECT sum(e.quantity) FROM public.farm_v2_activity_event e WHERE e.user_id=d.user_id AND e.day=d.day AND e.event_type=t.x->>'event'),0) END)::integer progress,t.ord
 FROM public.farm_v2_activity_day d CROSS JOIN LATERAL jsonb_array_elements(d.tasks) WITH ORDINALITY t(x,ord)
 WHERE d.user_id=p_user_id AND d.day=public.farm_v2_activity_day_key()),
 totals AS(SELECT COALESCE(sum(CASE WHEN progress=(x->>'target')::integer THEN 20 ELSE 0 END),0)::integer points FROM task_progress)
 SELECT jsonb_build_object('status',p_status,'day',public.farm_v2_activity_day_key()::text,'tasks',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x->>'id','label',x->>'label','target',(x->>'target')::integer,'progress',progress,'complete',progress=(x->>'target')::integer) ORDER BY ord) FROM task_progress),'[]'),
 'points',totals.points,'maximum',120,'milestones',(SELECT jsonb_agg(jsonb_build_object('activity',m.n,'reward',m.reward,'eligible',totals.points>=m.n AND NOT EXISTS(SELECT 1 FROM public.farm_v2_activity_claim c WHERE c.user_id=p_user_id AND c.day=public.farm_v2_activity_day_key() AND c.milestone=m.n),'claimed',EXISTS(SELECT 1 FROM public.farm_v2_activity_claim c WHERE c.user_id=p_user_id AND c.day=public.farm_v2_activity_day_key() AND c.milestone=m.n)) ORDER BY m.n) FROM (VALUES(30,'10 金幣'),(60,'隨機黃階盆栽'),(100,'蘊靈砂 ×1'))m(n,reward))) FROM totals
$$;

CREATE FUNCTION public.farm_v2_activity_credit_coins(p_owner uuid,p_user text,p_day date) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r jsonb;
BEGIN
 r:=public.core_wallet_apply_transaction(p_owner,10,'coin','credit',
 'farm-v2:activity:'||p_user||':'||p_day::text||':30','farm_v2_activity',p_day::text||':30','farm_v2_activity',NULL);
 IF r->>'result_status' NOT IN('created','duplicate') OR r->>'result_status' IS NULL OR NULLIF(r#>>'{transaction,id}','') IS NULL THEN RAISE EXCEPTION 'ACTIVITY_WALLET_CREDIT_FAILED'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.farm_v2_activity_credit_coins(uuid,text,date) FROM PUBLIC,anon,authenticated,farm_v2_runtime;

-- This wrapper is the only runtime reward/inspection capability.
CREATE FUNCTION farm_v2_rewards.activity(p_user_id text,p_action text DEFAULT 'status',p_milestone integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid; d date:=public.farm_v2_activity_day_key(); s jsonb; p public.farm_v2_player_state%ROWTYPE;
 w jsonb; workshop jsonb; reward jsonb; species integer; pot_id uuid; sand bigint;
BEGIN
 IF p_action IS NULL OR p_action NOT IN('status','claim','inspect_warehouse','inspect_pet') THEN RAISE EXCEPTION 'UNKNOWN_ACTIVITY_ACTION'; END IF;
 IF (p_action='claim' AND (p_milestone IS NULL OR p_milestone NOT IN(30,60,100))) OR (p_action<>'claim' AND p_milestone IS NOT NULL) THEN RAISE EXCEPTION 'INVALID_ACTIVITY_MILESTONE'; END IF;
 owner_id:=public.farm_v2_resolve_verified_wallet_owner(p_user_id);
 IF owner_id IS NULL THEN RETURN public.farm_v2_activity_summary(p_user_id,'unverified_identity'); END IF;
 SELECT * INTO p FROM public.farm_v2_player_state WHERE user_id=p_user_id FOR UPDATE;
 PERFORM public.farm_v2_activity_ensure_day(p_user_id);
 PERFORM 1 FROM public.farm_v2_activity_day WHERE user_id=p_user_id AND day=d FOR UPDATE;
 IF p_action='inspect_warehouse' THEN PERFORM public.farm_v2_record_activity_event(p_user_id,'inspect_warehouse:'||d,'inspect_warehouse',1);
 ELSIF p_action='inspect_pet' THEN
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(COALESCE(p.pet_state->'owned','[]')) pet WHERE pet IN('尋星犬','辟邪狻猊')) AND p.effective_paid_crystals<450 THEN RETURN public.farm_v2_activity_summary(p_user_id,'locked'); END IF;
   PERFORM public.farm_v2_record_activity_event(p_user_id,'inspect_pet:'||d,'inspect_pet',1);
 ELSIF p_action='claim' THEN
   IF EXISTS(SELECT 1 FROM public.farm_v2_activity_claim WHERE user_id=p_user_id AND day=d AND milestone=p_milestone) THEN RETURN public.farm_v2_activity_summary(p_user_id,'already_claimed'); END IF;
   s:=public.farm_v2_activity_summary(p_user_id);
   IF (s->>'points')::integer<p_milestone THEN RETURN public.farm_v2_activity_summary(p_user_id,'locked'); END IF;
   -- Existing workshop recovery owns an exact warehouse snapshot. Serialize this
   -- check with the same player lock; inventory rewards cannot invalidate it.
   IF p_milestone IN(60,100) AND EXISTS(SELECT 1 FROM public.farm_v2_mutation m
     WHERE m.user_id=p_user_id AND m.transaction_state IN('PENDING','WALLET_PENDING','WALLET_APPLIED','COMPENSATING')
       AND m.wallet_transaction->'assetPlan' IS NOT NULL) THEN
     RETURN public.farm_v2_activity_summary(p_user_id,'recovery_required');
   END IF;
   IF p_milestone=30 THEN
     -- Wallet call filled against existing trusted signin implementation below.
     PERFORM public.farm_v2_activity_credit_coins(owner_id,p_user_id,d);
     reward:=jsonb_build_object('coins',10);
   ELSE
     w:=p.warehouse_state;
     IF jsonb_typeof(w) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'ACTIVITY_INVALID_WAREHOUSE'; END IF;
     IF w ? 'workshop' AND jsonb_typeof(w->'workshop') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'ACTIVITY_INVALID_WORKSHOP'; END IF;
     workshop:=COALESCE(w->'workshop',jsonb_build_object('pots','[]'::jsonb,'decor','[]'::jsonb,'potGallery','{}'::jsonb,'decorGallery','{}'::jsonb,'materials',jsonb_build_object('蘊靈砂',0,'九霄玉髓',0)));
     IF jsonb_typeof(workshop->'pots') IS DISTINCT FROM 'array' OR jsonb_typeof(workshop->'materials') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'ACTIVITY_INVALID_WORKSHOP_INVENTORY'; END IF;
     IF jsonb_typeof(workshop#>'{materials,蘊靈砂}') IS DISTINCT FROM 'number' OR COALESCE(workshop#>>'{materials,蘊靈砂}','') !~ '^[0-9]{1,10}$' THEN RAISE EXCEPTION 'ACTIVITY_INVALID_SPIRIT_SAND'; END IF;
     sand:=(workshop#>>'{materials,蘊靈砂}')::bigint;
     IF sand>2147483646 THEN RAISE EXCEPTION 'ACTIVITY_SPIRIT_SAND_OVERFLOW'; END IF;
     IF p_milestone=60 THEN
       species:=1+floor(random()*6)::integer; pot_id:=gen_random_uuid();
       reward:=jsonb_build_object('id',pot_id,'species',species,'grade','黃','displayed',false,'acquiredAt',floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
       workshop:=jsonb_set(workshop,'{pots}',COALESCE(workshop->'pots','[]')||jsonb_build_array(reward));
     ELSE
       reward:=jsonb_build_object('material','蘊靈砂','quantity',1);
       workshop:=jsonb_set(workshop,'{materials}',COALESCE(workshop->'materials','{}')||jsonb_build_object('蘊靈砂',sand+1));
     END IF;
     UPDATE public.farm_v2_player_state SET warehouse_state=jsonb_set(w,'{workshop}',workshop),updated_at=clock_timestamp() WHERE user_id=p_user_id;
   END IF;
   INSERT INTO public.farm_v2_activity_claim(user_id,day,milestone,reward) VALUES(p_user_id,d,p_milestone,reward);
   RETURN public.farm_v2_activity_summary(p_user_id,'claimed');
 END IF;
 RETURN public.farm_v2_activity_summary(p_user_id);
END $$;

CREATE FUNCTION farm_v2_rewards.activity_visit(p_user_id text,p_friend_user_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF public.farm_v2_resolve_verified_wallet_owner(p_user_id) IS NULL THEN RETURN public.farm_v2_activity_summary(p_user_id,'unverified_identity'); END IF;
 IF p_user_id=p_friend_user_id OR NOT EXISTS(SELECT 1 FROM public.platform_friendships f
 JOIN public.farm_v2_player_state fp ON fp.user_id=p_friend_user_id
 WHERE ((f.user_a_id::text=p_user_id AND f.user_b_id::text=p_friend_user_id) OR (f.user_b_id::text=p_user_id AND f.user_a_id::text=p_friend_user_id))
 AND f.status='active' AND f.blocked_by_user_id IS NULL AND public.farm_v2_resolve_verified_wallet_owner(fp.user_id) IS NOT NULL) THEN
   RETURN public.farm_v2_activity_summary(p_user_id,'locked');
 END IF;
 PERFORM public.farm_v2_record_activity_event(p_user_id,'visit_friend:'||public.farm_v2_activity_day_key()::text,'visit_friend',1);
 RETURN public.farm_v2_activity_summary(p_user_id);
END $$;
REVOKE ALL ON FUNCTION farm_v2_rewards.activity_visit(text,text) FROM PUBLIC,anon,authenticated,farm_v2_runtime;
GRANT EXECUTE ON FUNCTION farm_v2_rewards.activity_visit(text,text) TO farm_v2_runtime;

CREATE FUNCTION public.farm_v2_activity_completed_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE species integer; cmd jsonb;
BEGIN
 IF NEW.transaction_state<>'COMPLETED' OR NEW.response IS NULL OR jsonb_typeof(NEW.response)<>'object' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.transaction_state='COMPLETED' THEN RETURN NEW; END IF;
 -- Journal retries/recovery retain original creation time. Never credit a prior day's work.
 IF public.farm_v2_activity_day_key(NEW.created_at)<>public.farm_v2_activity_day_key() THEN RETURN NEW; END IF;
 IF NEW.action~'^SOW:[1-6]$' AND jsonb_typeof(NEW.response#>'{land,plantedQuantity}')='number' AND NEW.response#>>'{land,plantedQuantity}' ~ '^[1-9][0-9]{0,8}$' THEN
   species:=split_part(NEW.action,':',2)::integer;
   PERFORM public.farm_v2_record_activity_event(NEW.user_id,NEW.request_id,'plant',(NEW.response#>>'{land,plantedQuantity}')::integer,species);
 ELSIF NEW.action~'^HARVEST:[1-6]$' THEN
   species:=split_part(NEW.action,':',2)::integer;
   -- Full-batch canonical plant capacities, not inventory's newbie-multiplied creditedQuantity.
   PERFORM public.farm_v2_record_activity_event(NEW.user_id,NEW.request_id,'harvest',(ARRAY[20,10,6,4,3,1])[species],species);
 ELSIF NEW.action~'^seed-purchase:[1-6]:[0-9]+$' AND jsonb_typeof(NEW.response->'seedsAdded')='number' AND NEW.response->>'seedsAdded' ~ '^[1-9][0-9]{0,8}$' THEN
   species:=split_part(NEW.action,':',2)::integer;
   PERFORM public.farm_v2_record_activity_event(NEW.user_id,NEW.request_id,'buy_seeds',(NEW.response->>'seedsAdded')::integer,species);
 ELSIF left(NEW.action,9)='WORKSHOP:' THEN
   BEGIN cmd:=substring(NEW.action FROM 10)::jsonb; EXCEPTION WHEN invalid_text_representation THEN RETURN NEW; END;
   IF jsonb_typeof(cmd)<>'object' THEN RETURN NEW; END IF;
   IF cmd->>'kind'='synthesize' THEN PERFORM public.farm_v2_record_activity_event(NEW.user_id,NEW.request_id,'synthesize',1);
   ELSIF cmd->>'kind'='displayPot' THEN PERFORM public.farm_v2_record_activity_event(NEW.user_id,NEW.request_id,'display_pot',1);
   ELSIF cmd->>'kind'='feedPet' THEN PERFORM public.farm_v2_record_activity_event(NEW.user_id,NEW.request_id,'feed_pet',1); END IF;
 ELSIF NEW.action~'^FRIEND:(BORROW|ASSIST):' AND NEW.response->>'successful'='true' THEN
   PERFORM public.farm_v2_record_activity_event(NEW.user_id,NEW.request_id,'interact_friend',1);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER farm_v2_activity_completed AFTER INSERT OR UPDATE ON public.farm_v2_mutation FOR EACH ROW EXECUTE FUNCTION public.farm_v2_activity_completed_mutation();
REVOKE ALL ON FUNCTION public.farm_v2_activity_day_key(timestamptz),public.farm_v2_activity_ensure_day(text),public.farm_v2_record_activity_event(text,text,text,integer,integer),public.farm_v2_activity_summary(text,text),public.farm_v2_activity_completed_mutation() FROM PUBLIC,anon,authenticated,farm_v2_runtime;
REVOKE ALL ON FUNCTION farm_v2_rewards.activity(text,text,integer) FROM PUBLIC,anon,authenticated,farm_v2_runtime;
GRANT EXECUTE ON FUNCTION farm_v2_rewards.activity(text,text,integer) TO farm_v2_runtime;
COMMIT;
