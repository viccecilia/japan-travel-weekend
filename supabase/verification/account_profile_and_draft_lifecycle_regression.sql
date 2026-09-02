-- Remote rollback-only behavior regression using existing fictitious accounts.
begin;
create temporary table test_account_context(owner_id uuid,other_id uuid,operations_id uuid,departure_id uuid,draft_id uuid) on commit drop;
with t as (insert into public.trips(slug,title,status) values('test-account-lifecycle-regression','TEST 账户生命周期','published') returning id),
d as (insert into public.departures(trip_id,departs_at,capacity,status,seat_price_jpy) select id,now()+interval '7 days',6,'open',100 from t returning id)
insert into test_account_context(owner_id,other_id,operations_id,departure_id)
select (select id from public.profiles where role='passenger' order by created_at limit 1),(select id from public.profiles where role='passenger' order by created_at offset 1 limit 1),(select id from public.profiles where role='operations' order by created_at limit 1),d.id from d;
do $$ begin if exists(select 1 from test_account_context where owner_id is null or other_id is null or operations_id is null) then raise exception 'FAIL: fictitious role fixtures missing'; end if; end $$;
grant select,update on test_account_context to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated','true');
select set_config('request.jwt.claim.sub',(select owner_id::text from test_account_context),'true');
select public.update_own_account_profile('TEST OWNER','TEST-PHONE','TEST EMERGENCY','TEST-EMERGENCY-PHONE',true,true);
do $$ declare v_role text; v_count integer; v_audit text; begin
  select role into v_role from public.profiles where id=auth.uid(); if v_role<>'passenger' then raise exception 'FAIL: profile update changed role'; end if;
  select count(*) into v_count from public.account_private_profiles where account_id=auth.uid(); if v_count<>1 then raise exception 'FAIL: owner profile missing'; end if;
  select row_to_json(a)::text into v_audit from public.account_audit_events a where actor_id=auth.uid() order by created_at desc limit 1;
  if v_audit like '%TEST-PHONE%' or v_audit like '%TEST-EMERGENCY-PHONE%' then raise exception 'FAIL: audit leaked private contact'; end if;
end $$;
update test_account_context c set draft_id=public.save_own_booking_draft(c.departure_id,1,0,0,'{"name":"TEST OWNER","phone":"TEST-PHONE","emergency":"TEST-EMERGENCY"}'::jsonb,'{}'::jsonb,'not_requested',true,true,'test-account-lifecycle-draft');
do $$ begin if not public.abandon_own_booking_draft((select draft_id from test_account_context)) then raise exception 'FAIL: owner could not abandon draft'; end if; end $$;
select set_config('request.jwt.claim.sub',(select other_id::text from test_account_context),'true');
do $$ declare v_count integer; begin
  select count(*) into v_count from public.account_private_profiles where account_id=(select owner_id from test_account_context); if v_count<>0 then raise exception 'FAIL: unrelated passenger read private profile'; end if;
  select count(*) into v_count from public.booking_drafts where id=(select draft_id from test_account_context); if v_count<>0 then raise exception 'FAIL: unrelated passenger read draft'; end if;
  if public.abandon_own_booking_draft((select draft_id from test_account_context)) then raise exception 'FAIL: unrelated passenger abandoned draft'; end if;
end $$;
reset role;
select 'PASS: private profile, role immutability, audit privacy, draft abandon and cross-account isolation' as result;
rollback;
