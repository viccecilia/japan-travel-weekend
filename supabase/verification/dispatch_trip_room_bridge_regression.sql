-- Remote test only. Every fixture and state transition is rolled back.
begin;
do $$
declare
  v_ops uuid; v_driver_account uuid; v_owner uuid; v_trip uuid; v_departure uuid;
  v_vehicle1 uuid; v_vehicle2 uuid; v_driver1 uuid; v_driver2 uuid; v_tasks jsonb; v_task_ids uuid[];
  v_prefix text:='bridge-'||txid_current()::text; v_start timestamptz:=now()+interval '2 days';
  v_step text:='setup';
begin
  select id into v_ops from public.profiles where role='operations' limit 1;
  select id into v_driver_account from public.profiles where role='driver' limit 1;
  select id into v_owner from public.profiles where role='passenger' limit 1;
  if v_ops is null or v_driver_account is null or v_owner is null then raise exception 'SETUP FAIL: operations, driver and passenger fictional profiles required'; end if;
  perform set_config('request.jwt.claim.sub',v_ops::text,true);
  v_step:='trip and departure';
  insert into public.trips(slug,title,status) values(v_prefix,'Dispatch bridge','draft') returning id into v_trip;
  insert into public.departures(trip_id,departs_at,capacity,status,seat_price_jpy) values(v_trip,v_start,19,'open',100) returning id into v_departure;
  insert into public.orders(account_id,departure_id,idempotency_key,seat_count,status,amount) values
    (v_owner,v_departure,v_prefix||'-o1',5,'paid',500),(v_owner,v_departure,v_prefix||'-o2',4,'paid',400);
  v_step:='fleet and drivers';
  insert into public.fleet_vehicles(registration_identifier,vehicle_type_key) values(v_prefix||'-v1','alphard-6') returning id into v_vehicle1;
  insert into public.fleet_vehicles(registration_identifier,vehicle_type_key) values(v_prefix||'-v2','hiace-13') returning id into v_vehicle2;
  insert into public.driver_resources(account_id,display_name,languages) values(v_driver_account,v_prefix||'-driver1',array['zh-CN']) returning id into v_driver1;
  insert into public.driver_resources(display_name,languages) values(v_prefix||'-driver2',array['ja']) returning id into v_driver2;
  insert into public.driver_vehicle_qualifications values(v_driver1,'alphard-6',now(),null),(v_driver2,'hiace-13',now(),null);
  insert into public.driver_availability_windows(driver_id,starts_at,ends_at) values(v_driver1,v_start-interval '1 hour',v_start+interval '14 hours'),(v_driver2,v_start-interval '1 hour',v_start+interval '14 hours');
  v_step:='save dispatch plan';
  v_tasks:=jsonb_build_array(
    jsonb_build_object('sequence',1,'vehicleType','alphard-6','capacity',6,'passengerCount',5,'driverId',v_driver1,'fleetVehicleId',v_vehicle1,'startsAt',v_start,'endsAt',v_start+interval '12 hours','operationalNotes','[]'::jsonb),
    jsonb_build_object('sequence',2,'vehicleType','hiace-13','capacity',13,'passengerCount',4,'driverId',v_driver2,'fleetVehicleId',v_vehicle2,'startsAt',v_start,'endsAt',v_start+interval '12 hours','operationalNotes','[]'::jsonb));
  select array_agg(value::text::uuid order by ordinality) into v_task_ids from jsonb_array_elements_text(public.operations_save_dispatch_plan(v_departure,v_tasks)) with ordinality;
  v_step:='partial confirmation';
  perform public.operations_confirm_dispatch_tasks(array[v_task_ids[1]]);
  if exists(select 1 from public.vehicle_groups where departure_id=v_departure) then raise exception 'FAIL partial plan created vehicle group'; end if;
  v_step:='final confirmation and bridge';
  perform public.operations_confirm_dispatch_tasks(array[v_task_ids[2]]);
  if (select count(*) from public.vehicle_groups where departure_id=v_departure)<>2 then raise exception 'FAIL one vehicle one group'; end if;
  if (select count(*) from public.trip_rooms r join public.vehicle_groups vg on vg.id=r.vehicle_group_id where vg.departure_id=v_departure)<>2 then raise exception 'FAIL Trip Room creation'; end if;
  if (select count(*) from public.vehicle_group_orders vgo join public.vehicle_groups vg on vg.id=vgo.vehicle_group_id where vg.departure_id=v_departure)<>2 then raise exception 'FAIL paid order allocation'; end if;
  if not exists(select 1 from public.staff_assignments sa join public.vehicle_groups vg on vg.id=sa.vehicle_group_id where vg.departure_id=v_departure and sa.staff_id=v_driver_account and sa.role='driver') then raise exception 'FAIL linked driver staff membership'; end if;
  v_step:='cancellation access revocation';
  perform public.operations_cancel_dispatch_tasks(array[v_task_ids[1]],'TEST rollback cancellation');
  if exists(select 1 from public.staff_assignments sa join public.vehicle_groups vg on vg.id=sa.vehicle_group_id where vg.departure_id=v_departure and sa.staff_id=v_driver_account) then raise exception 'FAIL cancelled driver retained room access'; end if;
  raise notice 'PASS dispatch Trip Room bridge regression';
exception when others then
  raise exception 'FAIL at %: %',v_step,sqlerrm;
end$$;
rollback;
