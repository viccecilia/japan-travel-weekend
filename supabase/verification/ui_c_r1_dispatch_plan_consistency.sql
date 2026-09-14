-- Test database only. Every fixture and state transition is rolled back.
begin;
do $$
declare
  v_ops uuid; v_owner uuid; v_trip uuid; v_departure uuid; v_conflict_departure uuid;
  v_vehicle uuid; v_vehicle2 uuid; v_driver uuid; v_task uuid; v_start timestamptz:=now()+interval '21 days';
  v_prefix text:='ui-c-r1-'||txid_current()::text; v_error text;
begin
  select id into v_ops from public.profiles where role='operations' limit 1;
  select id into v_owner from public.profiles where role='passenger' limit 1;
  if v_ops is null or v_owner is null then raise exception 'SETUP FAIL: operations and passenger test profiles required'; end if;
  perform set_config('request.jwt.claim.sub',v_ops::text,true);

  insert into public.trips(slug,title,status) values(v_prefix,'UI-C-R1 isolation','draft') returning id into v_trip;
  insert into public.departures(trip_id,departs_at,ends_at,capacity,status,seat_price_jpy)
    values(v_trip,v_start,v_start+interval '10 hours',45,'draft',100) returning id into v_departure;
  insert into public.orders(account_id,departure_id,idempotency_key,seat_count,status,amount) values
    (v_owner,v_departure,v_prefix||'-o1',20,'paid',2000),
    (v_owner,v_departure,v_prefix||'-o2',20,'paid',2000);
  insert into public.fleet_vehicles(registration_identifier,vehicle_type_key,sellable_capacity)
    values(v_prefix||'-45','bus-55',45) returning id into v_vehicle;
  insert into public.fleet_vehicles(registration_identifier,vehicle_type_key,sellable_capacity)
    values(v_prefix||'-45b','bus-55',45) returning id into v_vehicle2;
  insert into public.driver_resources(display_name,languages) values(v_prefix||'-driver',array['zh-CN']) returning id into v_driver;
  insert into public.driver_vehicle_qualifications(driver_id,vehicle_type_key) values(v_driver,'bus-55');
  insert into public.driver_availability_windows(driver_id,starts_at,ends_at) values(v_driver,v_start-interval '2 hours',v_start+interval '2 days');

  select (value #>> '{}')::uuid into v_task
  from jsonb_array_elements(public.operations_save_dispatch_plan(v_departure,jsonb_build_array(jsonb_build_object(
    'sequence',1,'vehicleType','bus-55','capacity',45,'passengerCount',40,
    'driverId',v_driver,'fleetVehicleId',v_vehicle,'startsAt',v_start,'endsAt',v_start+interval '10 hours',
    'operationalNotes','[]'::jsonb,'planningSource','manual_override')))) limit 1;
  if not exists(select 1 from public.vehicle_assignments where departure_id=v_departure and capacity=45 and planned_passengers=40) then
    raise exception 'FAIL: 45-seat vehicle did not retain a 40-passenger plan';
  end if;

  begin
    perform public.operations_save_dispatch_plan(v_departure,jsonb_build_array(jsonb_build_object(
      'sequence',1,'vehicleType','bus-55','capacity',45,'passengerCount',41,
      'driverId',v_driver,'fleetVehicleId',v_vehicle,'startsAt',v_start,'endsAt',v_start+interval '10 hours')));
    raise exception 'FAIL: plan above committed passenger count was accepted';
  exception when others then
    get stacked diagnostics v_error=message_text;
    if v_error not like '%planned passengers exceed committed departure passengers%' then raise; end if;
  end;

  begin
    perform public.operations_save_dispatch_plan(v_departure,jsonb_build_array(
      jsonb_build_object('sequence',1,'vehicleType','bus-55','capacity',45,'passengerCount',20,'driverId',v_driver,'fleetVehicleId',v_vehicle,'startsAt',v_start,'endsAt',v_start+interval '10 hours'),
      jsonb_build_object('sequence',2,'vehicleType','bus-55','capacity',45,'passengerCount',20,'driverId',v_driver,'fleetVehicleId',v_vehicle,'startsAt',v_start,'endsAt',v_start+interval '10 hours')));
    raise exception 'FAIL: duplicate vehicle or driver was accepted';
  exception when others then
    get stacked diagnostics v_error=message_text;
    if v_error not like '%duplicate dispatch resource%' then raise; end if;
  end;

  perform public.operations_confirm_dispatch_tasks(array[v_task]);
  insert into public.departures(trip_id,departs_at,ends_at,capacity,status,seat_price_jpy)
    values(v_trip,v_start+interval '1 hour',v_start+interval '11 hours',45,'draft',100) returning id into v_conflict_departure;
  insert into public.orders(account_id,departure_id,idempotency_key,seat_count,status,amount)
    values(v_owner,v_conflict_departure,v_prefix||'-conflict',1,'paid',100);
  begin
    perform public.operations_save_dispatch_plan(v_conflict_departure,jsonb_build_array(jsonb_build_object(
      'sequence',1,'vehicleType','bus-55','capacity',45,'passengerCount',1,
      'driverId',v_driver,'fleetVehicleId',v_vehicle2,'startsAt',v_start+interval '1 hour','endsAt',v_start+interval '11 hours')));
    raise exception 'FAIL: overlapping confirmed resource was accepted';
  exception when others then
    get stacked diagnostics v_error=message_text;
    if v_error not like '%dispatch resource time conflict%' then raise; end if;
  end;
  raise notice 'PASS UI-C-R1 45/40, committed limit, duplicate resource and time conflict behavior';
end$$;
rollback;
