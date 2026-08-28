-- 远程测试项目专用；需要 operations 与 passenger 虚构账户。全部测试数据在末尾回滚。
begin;

do $$
begin
  if (select count(*) from public.vehicle_type_configs where active) <> 4 then
    raise exception 'FAIL vehicle type seed count';
  end if;
  if (select count(*) from pg_tables where schemaname='public' and tablename in (
    'vehicle_type_configs','fleet_vehicles','driver_resources','driver_vehicle_qualifications',
    'driver_availability_windows','dispatch_tasks','dispatch_task_audit'
  ) and rowsecurity) <> 7 then
    raise exception 'FAIL operations tables or RLS missing';
  end if;
  if (select count(*) from pg_policies where schemaname='public' and policyname in (
    'vehicle_types_operations','fleet_vehicles_operations','driver_resources_operations',
    'driver_qualifications_operations','driver_windows_operations','dispatch_tasks_operations',
    'dispatch_audit_operations'
  )) <> 7 then
    raise exception 'FAIL operations policies missing';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='operations_create_vehicle' and p.prosecdef
  ) or not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='operations_create_driver' and p.prosecdef
  ) then
    raise exception 'FAIL operations functions missing or not security definer';
  end if;
end $$;

select set_config('jtw.operations_id',coalesce((select id::text from public.profiles where role='operations' order by created_at limit 1),''),true);
select set_config('jtw.passenger_id',coalesce((select id::text from public.profiles where role='passenger' order by created_at limit 1),''),true);

do $$
begin
  if current_setting('jtw.operations_id',true)='' or current_setting('jtw.passenger_id',true)='' then
    raise exception 'SETUP FAIL: expected fictional operations and passenger profiles';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('jtw.operations_id'),true);

do $$
declare
  created_vehicle_id uuid;
  created_driver_id uuid;
begin
  created_vehicle_id := public.operations_create_vehicle('TEST-JTW-021','alphard-6','test-yuzu-vehicle-021');
  created_driver_id := public.operations_create_driver(
    '测试司机 021','test-yuzu-driver-021',array['alphard-6','hiace-13'],array['zh','ja'],
    now(),now()+interval '12 hours'
  );
  if not exists(select 1 from public.fleet_vehicles fv where fv.id=created_vehicle_id and fv.vehicle_type_key='alphard-6') then
    raise exception 'FAIL operations vehicle creation';
  end if;
  if not exists(select 1 from public.driver_resources dr where dr.id=created_driver_id) then
    raise exception 'FAIL operations driver creation';
  end if;
  if (select count(*) from public.driver_vehicle_qualifications q where q.driver_id=created_driver_id)<>2 then
    raise exception 'FAIL driver qualifications';
  end if;
  if (select count(*) from public.driver_availability_windows w where w.driver_id=created_driver_id)<>1 then
    raise exception 'FAIL driver availability';
  end if;
end $$;

select set_config('request.jwt.claim.sub',current_setting('jtw.passenger_id'),true);

do $$
declare denied boolean := false;
begin
  begin
    perform public.operations_create_vehicle('TEST-DENIED-021','alphard-6',null);
  exception when others then
    denied := position('operations only' in sqlerrm)>0;
  end;
  if not denied then raise exception 'FAIL passenger could create vehicle'; end if;
  if exists(select 1 from public.fleet_vehicles where registration_identifier='TEST-JTW-021') then
    raise exception 'FAIL passenger can read operations fleet';
  end if;
end $$;

reset role;
rollback;
select 'PASS' as operations_fleet_dispatch_acceptance;
