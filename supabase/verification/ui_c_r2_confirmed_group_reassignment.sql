-- Test database only. Every fixture and state transition is rolled back.
begin;
do $$
declare
  v_ops uuid; v_passenger uuid; v_old_driver public.driver_resources%rowtype; v_new_driver public.driver_resources%rowtype;
  v_trip uuid; v_departure uuid; v_conflict_departure uuid; v_assignment uuid; v_conflict_assignment uuid;
  v_group uuid; v_room uuid; v_order_one uuid; v_order_two uuid; v_task uuid; v_conflict_task uuid;
  v_old_vehicle uuid; v_new_vehicle uuid; v_small_vehicle uuid; v_spare_vehicle uuid; v_conflict_vehicle uuid;
  v_vehicle_request uuid; v_driver_request uuid; v_negative_request uuid; v_start timestamptz:=now()+interval '28 days';
  v_prefix text:='ui-c-r2-'||txid_current()::text; v_error text; v_before_group_count integer; v_before_room_count integer; v_before_order_links integer;
begin
  select id into v_ops from public.profiles where role='operations' limit 1;
  select id into v_passenger from public.profiles where role='passenger' limit 1;
  select dr.* into v_old_driver from public.driver_resources dr join public.profiles p on p.id=dr.account_id where p.role in('driver','guide') and dr.account_id is not null order by dr.id limit 1;
  select dr.* into v_new_driver from public.driver_resources dr join public.profiles p on p.id=dr.account_id where p.role in('driver','guide') and dr.account_id is not null and dr.id<>v_old_driver.id order by dr.id limit 1;
  if v_ops is null or v_passenger is null or v_old_driver.id is null or v_new_driver.id is null then raise exception 'SETUP FAIL: operations, passenger and two approved driver accounts required'; end if;
  perform set_config('request.jwt.claim.sub',v_ops::text,true);
  update public.driver_resources set status='available' where id in(v_old_driver.id,v_new_driver.id);
  insert into public.driver_vehicle_qualifications(driver_id,vehicle_type_key) values(v_old_driver.id,'hiace-13'),(v_new_driver.id,'hiace-13') on conflict do nothing;
  insert into public.driver_availability_windows(driver_id,starts_at,ends_at,source) values
    (v_old_driver.id,v_start-interval '1 day',v_start+interval '2 days',v_prefix),
    (v_new_driver.id,v_start-interval '1 day',v_start+interval '2 days',v_prefix);

  insert into public.trips(slug,title,status) values(v_prefix,'UI-C-R2 isolation','draft') returning id into v_trip;
  insert into public.departures(trip_id,departs_at,ends_at,capacity,status,seat_price_jpy,sales_open_at,sales_close_at,meeting_name,meeting_address,map_lat,map_lng,dispatch_planning_status)
    values(v_trip,v_start,v_start+interval '10 hours',9,'draft',100,now()-interval '1 day',v_start-interval '1 day','TEST point','TEST fictional address',34.68,135.50,'confirmed') returning id into v_departure;
  insert into public.orders(account_id,departure_id,idempotency_key,seat_count,status,amount)
    values(v_passenger,v_departure,v_prefix||'-o1',2,'paid',200) returning id into v_order_one;
  insert into public.orders(account_id,departure_id,idempotency_key,seat_count,status,amount)
    values(v_passenger,v_departure,v_prefix||'-o2',2,'paid',200) returning id into v_order_two;
  insert into public.fleet_vehicles(registration_identifier,vehicle_type_key,sellable_capacity,status) values
    (v_prefix||'-old','hiace-13',9,'available'),(v_prefix||'-new','hiace-13',9,'available'),
    (v_prefix||'-small','hiace-13',3,'available'),(v_prefix||'-spare','hiace-13',9,'available'),
    (v_prefix||'-conflict','hiace-13',9,'available');
  select id into v_old_vehicle from public.fleet_vehicles where registration_identifier=v_prefix||'-old';
  select id into v_new_vehicle from public.fleet_vehicles where registration_identifier=v_prefix||'-new';
  select id into v_small_vehicle from public.fleet_vehicles where registration_identifier=v_prefix||'-small';
  select id into v_spare_vehicle from public.fleet_vehicles where registration_identifier=v_prefix||'-spare';
  select id into v_conflict_vehicle from public.fleet_vehicles where registration_identifier=v_prefix||'-conflict';
  insert into public.vehicle_assignments(departure_id,sequence,vehicle_type,capacity,planned_passengers,booked_seats,vehicle_label)
    values(v_departure,1,'hiace-13',9,4,4,v_prefix||'-old') returning id into v_assignment;
  insert into public.dispatch_tasks(vehicle_assignment_id,driver_id,fleet_vehicle_id,idempotency_key,status,payload,confirmed_by,confirmed_at)
    values(v_assignment,v_old_driver.id,v_old_vehicle,v_prefix||'-task','confirmed',jsonb_build_object('startsAt',v_start,'endsAt',v_start+interval '10 hours','vehicleType','hiace-13','capacity',9,'passengerCount',4),v_ops,now()) returning id into v_task;
  update public.fleet_vehicles set status='assigned' where id=v_old_vehicle;
  insert into public.vehicle_groups(departure_id,vehicle_assignment_id) values(v_departure,v_assignment) returning id into v_group;
  insert into public.trip_rooms(vehicle_group_id,opens_at,status) values(v_group,v_start-interval '1 day','open') returning id into v_room;
  insert into public.vehicle_group_orders(vehicle_group_id,order_id) values(v_group,v_order_one),(v_group,v_order_two);
  insert into public.staff_assignments(vehicle_group_id,staff_id,role) values(v_group,v_old_driver.account_id,'driver');
  select count(*) into v_before_group_count from public.vehicle_groups where departure_id=v_departure;
  select count(*) into v_before_room_count from public.trip_rooms where vehicle_group_id=v_group;
  select count(*) into v_before_order_links from public.vehicle_group_orders where vehicle_group_id=v_group;

  -- Vehicle-only change: saving keeps the old assignment; apply updates the same task and group.
  v_vehicle_request:=public.operations_request_vehicle_group_change(v_group,1,v_new_vehicle,v_old_driver.id,'TEST vehicle maintenance replacement',gen_random_uuid());
  if (select fleet_vehicle_id from public.dispatch_tasks where id=v_task)<>v_old_vehicle then raise exception 'FAIL request changed active vehicle before apply'; end if;
  perform public.operations_apply_vehicle_group_change(v_vehicle_request);
  if (select fleet_vehicle_id from public.dispatch_tasks where id=v_task)<>v_new_vehicle then raise exception 'FAIL vehicle change was not applied'; end if;
  if (select operations_version from public.vehicle_groups where id=v_group)<>2 then raise exception 'FAIL vehicle change did not increment group version'; end if;

  -- Driver time conflict is rejected by the apply RPC while the original driver remains active.
  insert into public.departures(trip_id,departs_at,ends_at,capacity,status,seat_price_jpy,sales_open_at,sales_close_at,meeting_name,meeting_address,map_lat,map_lng)
    values(v_trip,v_start+interval '1 hour',v_start+interval '9 hours',9,'draft',100,now()-interval '1 day',v_start-interval '1 day','TEST conflict','TEST conflict address',34.68,135.50) returning id into v_conflict_departure;
  insert into public.vehicle_assignments(departure_id,sequence,vehicle_type,capacity,planned_passengers,booked_seats)
    values(v_conflict_departure,1,'hiace-13',9,1,0) returning id into v_conflict_assignment;
  insert into public.dispatch_tasks(vehicle_assignment_id,driver_id,fleet_vehicle_id,idempotency_key,status,payload,confirmed_by,confirmed_at)
    values(v_conflict_assignment,v_new_driver.id,v_conflict_vehicle,v_prefix||'-conflict-task','confirmed',jsonb_build_object('startsAt',v_start+interval '1 hour','endsAt',v_start+interval '9 hours'),v_ops,now()) returning id into v_conflict_task;
  update public.fleet_vehicles set status='assigned' where id=v_conflict_vehicle;
  v_negative_request:=public.operations_request_vehicle_group_change(v_group,2,v_spare_vehicle,v_new_driver.id,'TEST driver time conflict rejection',gen_random_uuid());
  begin
    perform public.operations_apply_vehicle_group_change(v_negative_request);raise exception 'FAIL driver time conflict was accepted';
  exception when others then get stacked diagnostics v_error=message_text;if v_error not like '%driver has a time conflict%' then raise;end if;end;
  if (select driver_id from public.dispatch_tasks where id=v_task)<>v_old_driver.id then raise exception 'FAIL time conflict changed active driver'; end if;
  delete from public.vehicle_group_change_requests where id=v_negative_request;
  update public.dispatch_tasks set status='cancelled' where id=v_conflict_task;
  update public.fleet_vehicles set status='available' where id=v_conflict_vehicle;

  -- Driver-only change: old access is revoked, new access is granted, and acknowledgement is reset.
  v_driver_request:=public.operations_request_vehicle_group_change(v_group,2,v_new_vehicle,v_new_driver.id,'TEST driver replacement after schedule change',gen_random_uuid());
  if (select driver_id from public.dispatch_tasks where id=v_task)<>v_old_driver.id then raise exception 'FAIL request changed active driver before apply'; end if;
  perform public.operations_apply_vehicle_group_change(v_driver_request);
  if (select driver_id from public.dispatch_tasks where id=v_task)<>v_new_driver.id then raise exception 'FAIL driver change was not applied'; end if;
  if public.is_active_group_staff(v_old_driver.account_id,v_group) then raise exception 'FAIL old driver retained group access'; end if;
  if not public.is_active_group_staff(v_new_driver.account_id,v_group) then raise exception 'FAIL new driver did not receive group access'; end if;
  if exists(select 1 from public.staff_assignment_acknowledgements a join public.staff_assignments s on s.id=a.staff_assignment_id where s.vehicle_group_id=v_group and s.staff_id=v_new_driver.account_id) then raise exception 'FAIL new driver inherited stale acknowledgement'; end if;

  -- Replay is idempotent and does not duplicate tasks, groups, rooms, orders or audit rows.
  perform public.operations_apply_vehicle_group_change(v_driver_request);
  if (select count(*) from public.dispatch_tasks where vehicle_assignment_id=v_assignment)<>1
    or (select count(*) from public.vehicle_groups where departure_id=v_departure)<>v_before_group_count
    or (select count(*) from public.trip_rooms where vehicle_group_id=v_group)<>v_before_room_count
    or (select count(*) from public.vehicle_group_orders where vehicle_group_id=v_group)<>v_before_order_links then
    raise exception 'FAIL idempotent replay duplicated fulfilment records';
  end if;
  if (select count(*) from public.dispatch_task_audit where dispatch_task_id=v_task and action='vehicle_group_reassigned')<>2 then raise exception 'FAIL reassignment audit count is incorrect'; end if;
  update public.vehicle_group_change_requests set notification_status='failed',notification_last_error='TEST receiver unavailable' where id=v_driver_request;
  perform public.operations_retry_vehicle_group_change_notification(v_driver_request);
  if not exists(select 1 from public.vehicle_group_change_requests where id=v_driver_request and notification_status='pending' and notification_attempts=2) then raise exception 'FAIL notification retry state was not preserved'; end if;

  -- Capacity failure leaves active arrangement intact.
  v_negative_request:=public.operations_request_vehicle_group_change(v_group,3,v_small_vehicle,v_new_driver.id,'TEST insufficient vehicle rejection',gen_random_uuid());
  begin
    perform public.operations_apply_vehicle_group_change(v_negative_request);raise exception 'FAIL insufficient vehicle was accepted';
  exception when others then get stacked diagnostics v_error=message_text;if v_error not like '%capacity is insufficient%' then raise;end if;end;
  if (select fleet_vehicle_id from public.dispatch_tasks where id=v_task)<>v_new_vehicle then raise exception 'FAIL capacity error changed active vehicle'; end if;
  delete from public.vehicle_group_change_requests where id=v_negative_request;

  -- Stale version and completed group are rejected without changing active arrangement.
  v_negative_request:=public.operations_request_vehicle_group_change(v_group,3,v_spare_vehicle,v_old_driver.id,'TEST stale version rejection',gen_random_uuid());
  update public.vehicle_groups set operations_version=4 where id=v_group;
  begin
    perform public.operations_apply_vehicle_group_change(v_negative_request);raise exception 'FAIL stale version was accepted';
  exception when others then get stacked diagnostics v_error=message_text;if v_error not like '%version conflict%' then raise;end if;end;
  update public.vehicle_groups set operations_version=3 where id=v_group;
  delete from public.vehicle_group_change_requests where id=v_negative_request;
  update public.departures set status='completed' where id=v_departure;
  begin
    perform public.operations_request_vehicle_group_change(v_group,3,v_spare_vehicle,v_old_driver.id,'TEST completed group rejection',gen_random_uuid());raise exception 'FAIL completed group was accepted';
  exception when others then get stacked diagnostics v_error=message_text;if v_error not like '%completed vehicle group cannot be changed%' then raise;end if;end;

  if (select id from public.vehicle_groups where id=v_group)<>v_group or (select id from public.trip_rooms where id=v_room)<>v_room
    or (select count(*) from public.vehicle_group_orders where vehicle_group_id=v_group)<>2 then raise exception 'FAIL group, room or order identity changed'; end if;
  raise notice 'PASS UI-C-R2 vehicle change, driver change, capacity, time conflict, version, replay, permissions, identities and failure preservation';
end$$;
rollback;
