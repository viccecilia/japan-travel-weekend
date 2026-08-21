-- 远程测试项目专用；需要四个虚构角色账户。全部数据在末尾回滚。
begin;
do $$
declare
  v_driver uuid;v_guide uuid;v_operations uuid;v_passenger uuid;
  v_trip uuid;v_departure uuid;v_assignment_one uuid;v_assignment_two uuid;v_group_one uuid;v_group_two uuid;
  v_order uuid;v_boardings uuid[]:=array[]::uuid[];v_index integer;v_result record;v_first record;
  v_prefix text:='boarding-regression-'||txid_current()::text||'-';
  v_digests bytea[]:=array[digest('opaque-a','sha256'),digest('opaque-b','sha256'),digest('opaque-c','sha256'),digest('opaque-d','sha256'),digest('opaque-e','sha256'),digest('opaque-f','sha256')];
begin
  select p.id into v_driver from public.profiles as p where p.role='driver' order by p.created_at limit 1;
  select p.id into v_guide from public.profiles as p where p.role='guide' order by p.created_at limit 1;
  select p.id into v_operations from public.profiles as p where p.role='operations' order by p.created_at limit 1;
  select p.id into v_passenger from public.profiles as p where p.role='passenger' order by p.created_at limit 1;
  if v_driver is null or v_guide is null or v_operations is null or v_passenger is null then raise exception 'SETUP FAIL: create fictional driver, guide, operations and passenger profiles'; end if;

  insert into public.trips as t(slug,title,status) values(v_prefix||'trip','Boarding regression','draft') returning t.id into v_trip;
  insert into public.departures as d(trip_id,capacity,status) values(v_trip,10,'open') returning d.id into v_departure;
  insert into public.vehicle_assignments as va(departure_id,sequence,vehicle_type,capacity) values(v_departure,1,'test-vehicle',10) returning va.id into v_assignment_one;
  insert into public.vehicle_assignments as va(departure_id,sequence,vehicle_type,capacity) values(v_departure,2,'test-vehicle',10) returning va.id into v_assignment_two;
  insert into public.vehicle_groups as vg(departure_id,vehicle_assignment_id) values(v_departure,v_assignment_one) returning vg.id into v_group_one;
  insert into public.vehicle_groups as vg(departure_id,vehicle_assignment_id) values(v_departure,v_assignment_two) returning vg.id into v_group_two;
  insert into public.staff_assignments(vehicle_group_id,staff_id,role) values(v_group_one,v_driver,'driver'),(v_group_one,v_guide,'guide'),(v_group_two,v_driver,'driver');

  for v_index in 1..6 loop
    insert into public.orders as o(account_id,departure_id,idempotency_key,seat_count,status) values(v_passenger,v_departure,v_prefix||'order-'||v_index,1,'confirmed') returning o.id into v_order;
    insert into public.vehicle_group_orders(vehicle_group_id,order_id) values(v_group_one,v_order);
    insert into public.boardings as b(order_id,status) values(v_order,'not_issued') returning b.id into v_order;
    v_boardings:=array_append(v_boardings,v_order);
  end loop;

  for v_index in 1..6 loop
    perform public.issue_boarding_credential(v_boardings[v_index],v_group_one,v_digests[v_index],1,case when v_index=4 then now()+interval '1 second' else now()+interval '30 minutes' end);
  end loop;

  begin perform public.verify_boarding_credential(v_digests[1],v_passenger,v_group_one,v_prefix||'unauthorized',now());raise exception 'FAIL passenger scanner was accepted';exception when others then if sqlerrm='FAIL passenger scanner was accepted' then raise; end if;end;

  select * into v_first from public.verify_boarding_credential(v_digests[1],v_driver,v_group_one,v_prefix||'driver-valid',now());
  if v_first.result<>'valid' then raise exception 'FAIL first driver scan'; end if;
  select * into v_result from public.verify_boarding_credential(v_digests[1],v_driver,v_group_one,v_prefix||'driver-valid',now()+interval '1 minute');
  if v_result.result<>'valid' or v_result.boarding_id<>v_first.boarding_id or v_result.verified_at<>v_first.verified_at then raise exception 'FAIL idempotent retry'; end if;
  begin perform public.verify_boarding_credential(v_digests[2],v_driver,v_group_one,v_prefix||'driver-valid',now());raise exception 'FAIL idempotency mismatch accepted';exception when others then if sqlerrm='FAIL idempotency mismatch accepted' then raise; end if;end;
  select * into v_result from public.verify_boarding_credential(v_digests[1],v_driver,v_group_one,v_prefix||'driver-used',now());if v_result.result<>'used' then raise exception 'FAIL second scan was not used';end if;

  select * into v_result from public.verify_boarding_credential(v_digests[2],v_guide,v_group_one,v_prefix||'guide-valid',now());if v_result.result<>'valid' then raise exception 'FAIL guide scan';end if;
  select * into v_result from public.verify_boarding_credential(v_digests[3],v_operations,v_group_one,v_prefix||'operations-valid',now());if v_result.result<>'valid' then raise exception 'FAIL operations scan';end if;
  select * into v_result from public.verify_boarding_credential(v_digests[4],v_driver,v_group_one,v_prefix||'expired',now()+interval '2 seconds');if v_result.result<>'expired' then raise exception 'FAIL expired scan';end if;
  if not public.revoke_boarding_credential(v_digests[5],now()) then raise exception 'FAIL revoke setup';end if;
  select * into v_result from public.verify_boarding_credential(v_digests[5],v_driver,v_group_one,v_prefix||'revoked',now());if v_result.result<>'revoked' then raise exception 'FAIL revoked scan';end if;
  select * into v_result from public.verify_boarding_credential(v_digests[6],v_driver,v_group_two,v_prefix||'wrong-vehicle',now());if v_result.result<>'wrong-vehicle' then raise exception 'FAIL wrong vehicle scan';end if;

  if not exists(select 1 from public.boardings as b where b.id=v_boardings[1] and b.status='boarded' and b.boarded_at is not null) then raise exception 'FAIL boarding was not atomically completed';end if;
  if exists(select 1 from public.boarding_credentials as bc where octet_length(bc.token_digest)<>32) or exists(select 1 from public.boarding_verification_attempts as a where octet_length(a.request_fingerprint_digest)<>32) then raise exception 'FAIL digest storage boundary';end if;
  if has_table_privilege('authenticated','public.boarding_credentials','SELECT') or has_table_privilege('authenticated','public.boarding_verification_attempts','SELECT') then raise exception 'FAIL private table grants';end if;
  if has_function_privilege('anon','public.verify_boarding_credential(bytea,uuid,uuid,text,timestamptz)','EXECUTE') or has_function_privilege('authenticated','public.verify_boarding_credential(bytea,uuid,uuid,text,timestamptz)','EXECUTE') or not has_function_privilege('service_role','public.verify_boarding_credential(bytea,uuid,uuid,text,timestamptz)','EXECUTE') then raise exception 'FAIL verify execute grants';end if;
  raise notice 'PASS boarding credential regression';
end $$;
rollback;
