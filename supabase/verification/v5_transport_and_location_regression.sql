-- Disposable remote test only. All fictional writes are rolled back.
begin;
do $$
declare v_owner uuid;v_driver_account uuid;v_ops uuid;v_driver uuid;v_vehicle uuid;v_trip uuid;v_departure uuid;v_order uuid;v_assignment uuid;v_group uuid;v_passenger uuid;v_checkin uuid;v_stat record;v_session_one uuid;v_session_two uuid;v_prefix text:='v5-d-'||txid_current()::text||'-';
begin
  select p.id into v_owner from public.profiles p where p.role='passenger' limit 1;
  select p.id into v_driver_account from public.profiles p where p.role in ('driver','guide') limit 1;
  select p.id into v_ops from public.profiles p where p.role='operations' limit 1;
  if v_owner is null or v_driver_account is null or v_ops is null then raise exception 'SETUP FAIL: passenger, driver and operations profiles required'; end if;
  select d.id into v_driver from public.driver_resources d where d.account_id=v_driver_account;
  if v_driver is null then insert into public.driver_resources(account_id,display_name,status) values(v_driver_account,'V5 fictional driver','available') returning id into v_driver; end if;
  insert into public.trips(slug,title,status,content) values(v_prefix||'trip','V5 transport regression','published',jsonb_build_object('itinerary',jsonb_build_array('test'),'included',jsonb_build_array('test'),'excluded',jsonb_build_array('test'),'description','Fictional transport regression route.','childPolicy','Fictional child policy.','luggagePolicy','Fictional luggage policy.','accessibilityInfo','Fictional accessibility information.','mealInfo','Fictional meal information.','weatherPolicy','Fictional weather policy.','cancellationPolicyVersion','test-v1')) returning id into v_trip;
  insert into public.departures(trip_id,departs_at,ends_at,capacity,status,meeting_name,meeting_address,map_lat,map_lng,minimum_guests,seat_price_jpy,sales_open_at,sales_close_at) values(v_trip,now()+interval '1 day',now()+interval '1 day 9 hours',6,'open','V5 point','Fictional address',34.68,135.50,1,7000,now()-interval '1 day',now()+interval '23 hours') returning id into v_departure;
  insert into public.orders(account_id,departure_id,idempotency_key,seat_count,status,amount) values(v_owner,v_departure,v_prefix||'order',3,'paid',21000) returning id into v_order;
  insert into public.vehicle_assignments(departure_id,sequence,vehicle_type,vehicle_label,capacity,booked_seats) values(v_departure,1,'test-6','V5 car',6,3) returning id into v_assignment;
  insert into public.vehicle_groups(departure_id,vehicle_assignment_id) values(v_departure,v_assignment) returning id into v_group;
  insert into public.vehicle_group_orders(vehicle_group_id,order_id) values(v_group,v_order);
  insert into public.staff_assignments(vehicle_group_id,staff_id,role) values(v_group,v_driver_account,'driver');
  insert into public.trip_rooms(vehicle_group_id,opens_at,status) values(v_group,now(),'open');
  insert into public.fleet_vehicles(registration_identifier,vehicle_type_key,status) values(v_prefix||'car','alphard-6','available') returning id into v_vehicle;
  insert into public.dispatch_tasks(vehicle_assignment_id,driver_id,fleet_vehicle_id,idempotency_key,status,payload) values(v_assignment,v_driver,v_vehicle,v_prefix||'dispatch','accepted',jsonb_build_object('startsAt',now()+interval '1 day','endsAt',now()+interval '1 day 10 hours'));
  for v_passenger in insert into public.passengers(order_id,display_name,passenger_type) values(v_order,'V5 passenger 1','adult'),(v_order,'V5 passenger 2','adult'),(v_order,'V5 passenger 3','adult') returning id loop
    insert into public.passenger_checkins(passenger_id,order_id,vehicle_group_id,status,status_at,updated_by) values(v_passenger,v_order,v_group,'boarded',now(),v_driver_account) returning id into v_checkin;
    insert into public.passenger_checkin_events(checkin_id,actor_id,idempotency_key,status) values(v_checkin,v_driver_account,v_prefix||v_passenger::text,'boarded');
  end loop;
  insert into public.operational_incidents(departure_id,vehicle_group_id,kind,severity,summary,created_by) values(v_departure,v_group,'other','medium','V5 fictional incident one',v_ops),(v_departure,v_group,'other','medium','V5 fictional incident two',v_ops);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_ops,'role','authenticated')::text,true);
  select * into v_stat from public.get_operations_driver_transport_statistics((now() at time zone 'Asia/Tokyo')::date,((now()+interval '2 days') at time zone 'Asia/Tokyo')::date) s where s.driver_id=v_driver;
  if v_stat.assigned_passengers<>3 or v_stat.boarded_passengers<>3 or v_stat.available_seats<>6 or v_stat.open_incidents<>2 then raise exception 'FAIL transport aggregation assigned %, boarded %, seats %, incidents %',v_stat.assigned_passengers,v_stat.boarded_passengers,v_stat.available_seats,v_stat.open_incidents; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_driver_account,'role','authenticated')::text,true);
  v_session_one:=public.start_driver_location_session(v_group,15);
  perform public.append_driver_location_point(v_group,v_session_one,34.680001,135.500001,5,now()-interval '2 seconds',1);
  v_session_two:=public.start_driver_location_session(v_group,15);
  perform public.append_driver_location_point(v_group,v_session_two,34.680002,135.500002,5,now()-interval '1 second',1);
  begin perform public.append_driver_location_point(v_group,v_session_one,34.680003,135.500003,5,now(),2);raise exception 'FAIL old session reopened';exception when others then if sqlerrm='FAIL old session reopened' then raise; end if;end;
  perform public.stop_driver_location(v_group);
  begin perform public.append_driver_location_point(v_group,v_session_two,34.680004,135.500004,5,now(),2);raise exception 'FAIL stopped session reopened';exception when others then if sqlerrm='FAIL stopped session reopened' then raise; end if;end;
  raise notice 'PASS V5 transport aggregation and location session lifecycle';
end$$;
rollback;
