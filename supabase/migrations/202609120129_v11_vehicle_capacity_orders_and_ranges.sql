begin;

alter table public.fleet_vehicles add column if not exists sellable_capacity integer;
update public.fleet_vehicles fv set sellable_capacity=vt.sellable_capacity from public.vehicle_type_configs vt where vt.type_key=fv.vehicle_type_key and fv.sellable_capacity is null;
alter table public.fleet_vehicles alter column sellable_capacity set not null;
alter table public.fleet_vehicles drop constraint if exists fleet_vehicles_sellable_capacity_check;
alter table public.fleet_vehicles add constraint fleet_vehicles_sellable_capacity_check check(sellable_capacity between 1 and 100);

alter table public.vehicle_assignments add column if not exists planned_passengers integer;
update public.vehicle_assignments set planned_passengers=capacity where planned_passengers is null;
alter table public.vehicle_assignments alter column planned_passengers set not null;
alter table public.vehicle_assignments drop constraint if exists vehicle_assignments_planned_passengers_check;
alter table public.vehicle_assignments add constraint vehicle_assignments_planned_passengers_check check(planned_passengers between 0 and capacity);

create or replace function public.operations_save_dispatch_plan(p_departure uuid,p_tasks jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare item jsonb;assignment_id uuid;task_id uuid;existing_status public.dispatch_task_status;result jsonb:='[]'::jsonb;
 sequence_value integer;physical_capacity integer;passenger_value integer;vehicle_type_value text;driver_value uuid;fleet_value uuid;
 starts_value timestamptz;ends_value timestamptz;idempotency_value text;source_value text;requested_sequences integer[];committed_seats integer;
begin
 if not public.is_operations() then raise exception 'operations only'; end if;
 perform 1 from public.departures where id=p_departure for update;if not found then raise exception 'unknown departure';end if;
 if jsonb_typeof(p_tasks)<>'array' or jsonb_array_length(p_tasks) not between 1 and 20 then raise exception 'invalid dispatch plan';end if;
 if (select count(distinct value->>'driverId') from jsonb_array_elements(p_tasks))<>jsonb_array_length(p_tasks)
  or (select count(distinct value->>'fleetVehicleId') from jsonb_array_elements(p_tasks))<>jsonb_array_length(p_tasks)
  or (select count(distinct value->>'sequence') from jsonb_array_elements(p_tasks))<>jsonb_array_length(p_tasks) then raise exception 'duplicate dispatch resource';end if;
 select array_agg((value->>'sequence')::integer order by (value->>'sequence')::integer) into requested_sequences from jsonb_array_elements(p_tasks);
 select coalesce(sum(seat_count),0)::integer into committed_seats from public.orders where departure_id=p_departure and status in('paid','confirmed');
 if (select coalesce(sum((value->>'passengerCount')::integer),0) from jsonb_array_elements(p_tasks))>committed_seats then raise exception 'planned passengers exceed committed departure passengers';end if;
 if exists(select 1 from public.dispatch_tasks dt join public.vehicle_assignments va on va.id=dt.vehicle_assignment_id where va.departure_id=p_departure and not(va.sequence=any(requested_sequences)) and dt.status<>'draft') then raise exception 'published dispatch task requires change workflow';end if;
 delete from public.dispatch_tasks dt using public.vehicle_assignments va where dt.vehicle_assignment_id=va.id and va.departure_id=p_departure and not(va.sequence=any(requested_sequences)) and dt.status='draft';
 delete from public.vehicle_assignments va where va.departure_id=p_departure and not(va.sequence=any(requested_sequences)) and not exists(select 1 from public.vehicle_groups vg where vg.vehicle_assignment_id=va.id);
 for item in select value from jsonb_array_elements(p_tasks) loop
  sequence_value:=(item->>'sequence')::integer;passenger_value:=(item->>'passengerCount')::integer;driver_value:=(item->>'driverId')::uuid;fleet_value:=(item->>'fleetVehicleId')::uuid;
  starts_value:=(item->>'startsAt')::timestamptz;ends_value:=(item->>'endsAt')::timestamptz;source_value:=coalesce(nullif(item->>'planningSource',''),'automatic');
  select vehicle_type_key,sellable_capacity into vehicle_type_value,physical_capacity from public.fleet_vehicles where id=fleet_value and status='available';
  if vehicle_type_value is null then raise exception 'vehicle unavailable';end if;
  if source_value not in('automatic','manual_override') or sequence_value<1 or passenger_value<0 or passenger_value>physical_capacity or ends_value<=starts_value then raise exception 'invalid dispatch task';end if;
  if coalesce(item->>'vehicleType','')<>vehicle_type_value or (item->>'capacity')::integer<>physical_capacity then raise exception 'vehicle capacity mismatch';end if;
  if not exists(select 1 from public.driver_resources d join public.driver_vehicle_qualifications q on q.driver_id=d.id and q.vehicle_type_key=vehicle_type_value join public.driver_availability_windows w on w.driver_id=d.id and w.starts_at<=starts_value and w.ends_at>=ends_value where d.id=driver_value and d.status='available') then raise exception 'driver unavailable or unqualified';end if;
  insert into public.vehicle_assignments(departure_id,sequence,vehicle_type,capacity,planned_passengers) values(p_departure,sequence_value,vehicle_type_value,physical_capacity,passenger_value)
   on conflict(departure_id,sequence) do update set vehicle_type=excluded.vehicle_type,capacity=excluded.capacity,planned_passengers=excluded.planned_passengers returning id into assignment_id;
  idempotency_value:='dispatch:'||p_departure::text||':'||sequence_value::text;select id,status into task_id,existing_status from public.dispatch_tasks where idempotency_key=idempotency_value for update;
  if exists(select 1 from public.dispatch_tasks t where (task_id is null or t.id<>task_id) and t.status in('confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress') and (t.driver_id=driver_value or t.fleet_vehicle_id=fleet_value) and (t.payload->>'startsAt')::timestamptz<ends_value and (t.payload->>'endsAt')::timestamptz>starts_value) then raise exception 'dispatch resource time conflict';end if;
  if task_id is null then insert into public.dispatch_tasks(vehicle_assignment_id,driver_id,fleet_vehicle_id,idempotency_key,payload,planning_source) values(assignment_id,driver_value,fleet_value,idempotency_value,item-'driverId'-'fleetVehicleId'-'sequence'-'planningSource',source_value) returning id into task_id;
  elsif existing_status='draft' then update public.dispatch_tasks set vehicle_assignment_id=assignment_id,driver_id=driver_value,fleet_vehicle_id=fleet_value,payload=item-'driverId'-'fleetVehicleId'-'sequence'-'planningSource',planning_source=source_value,last_error=null,updated_at=now() where id=task_id;
  else raise exception 'only draft tasks can be replaced';end if;
  insert into public.dispatch_task_audit(dispatch_task_id,actor_id,action,to_status,detail) values(task_id,auth.uid(),case when existing_status is null then 'draft_created' else 'draft_updated' end,'draft',jsonb_build_object('source',source_value,'plannedPassengers',passenger_value,'physicalCapacity',physical_capacity));
  result:=result||jsonb_build_array(task_id);
 end loop;return result;
end$$;

create or replace function public.finalize_dispatch_departure(p_departure uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_task record;v_order record;v_group uuid;v_room_open timestamptz;
begin
 if not public.is_operations() then raise exception 'operations only';end if;
 if exists(select 1 from public.dispatch_tasks dt join public.vehicle_assignments va on va.id=dt.vehicle_assignment_id where va.departure_id=p_departure and dt.status='draft') then return false;end if;
 if (select coalesce(sum(va.planned_passengers),0) from public.vehicle_assignments va join public.dispatch_tasks dt on dt.vehicle_assignment_id=va.id where va.departure_id=p_departure and dt.status in('confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress','completed'))<>(select coalesce(sum(o.seat_count),0) from public.orders o where o.departure_id=p_departure and o.status in('paid','confirmed')) then raise exception 'dispatch plan must assign every committed passenger exactly once';end if;
 select coalesce(d.chat_opens_at,(((d.departs_at at time zone 'Asia/Tokyo')::date-1)+time '12:00') at time zone 'Asia/Tokyo') into v_room_open from public.departures d where d.id=p_departure for update;if v_room_open is null then raise exception 'departure time required before fulfilment';end if;
 for v_task in select dt.id task_id,dt.driver_id,dr.account_id,va.id assignment_id,va.sequence,fv.registration_identifier from public.dispatch_tasks dt join public.vehicle_assignments va on va.id=dt.vehicle_assignment_id join public.driver_resources dr on dr.id=dt.driver_id left join public.fleet_vehicles fv on fv.id=dt.fleet_vehicle_id where va.departure_id=p_departure and dt.status in('confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress','completed') order by va.sequence loop
  update public.vehicle_assignments set vehicle_label=coalesce(v_task.registration_identifier,vehicle_label) where id=v_task.assignment_id;insert into public.vehicle_groups(departure_id,vehicle_assignment_id) values(p_departure,v_task.assignment_id) on conflict(vehicle_assignment_id) do update set departure_id=excluded.departure_id returning id into v_group;insert into public.trip_rooms(vehicle_group_id,opens_at,status) values(v_group,v_room_open,case when v_room_open<=now() then 'open' else 'frozen' end) on conflict(vehicle_group_id) do update set opens_at=excluded.opens_at,status=case when public.trip_rooms.status='closed' then 'closed' when excluded.opens_at<=now() then 'open' else 'frozen' end;if v_task.account_id is not null then insert into public.staff_assignments(vehicle_group_id,staff_id,role) values(v_group,v_task.account_id,'driver') on conflict(vehicle_group_id,staff_id) do update set role='driver';end if;
 end loop;
 for v_order in select o.id,o.seat_count from public.orders o where o.departure_id=p_departure and o.status in('paid','confirmed') and not exists(select 1 from public.vehicle_group_orders vgo where vgo.order_id=o.id) order by o.created_at,o.id loop
  select vg.id into v_group from public.vehicle_groups vg join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id where vg.departure_id=p_departure and va.planned_passengers-coalesce((select sum(o2.seat_count) from public.vehicle_group_orders vgo2 join public.orders o2 on o2.id=vgo2.order_id where vgo2.vehicle_group_id=vg.id and o2.status in('paid','confirmed')),0)>=v_order.seat_count order by va.sequence limit 1;
  if v_group is null then raise exception 'order cannot fit within vehicle plan without splitting: %',v_order.id;end if;insert into public.vehicle_group_orders(vehicle_group_id,order_id) values(v_group,v_order.id);
 end loop;
 update public.vehicle_assignments va set booked_seats=coalesce((select sum(o.seat_count) from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id join public.vehicle_groups vg on vg.id=vgo.vehicle_group_id where vg.vehicle_assignment_id=va.id and o.status in('paid','confirmed')),0) where va.departure_id=p_departure;update public.departures set dispatch_planning_status='confirmed',updated_at=now() where id=p_departure;return true;
end$$;

create or replace function public.try_allocate_paid_order(p_order uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order public.orders%rowtype;v_group uuid;v_assignment uuid;
begin
 select * into v_order from public.orders where id=p_order for update;if v_order.id is null or v_order.status not in('paid','confirmed') then return false;end if;if exists(select 1 from public.vehicle_group_orders where order_id=p_order) then return true;end if;
 select vg.id,va.id into v_group,v_assignment from public.vehicle_groups vg join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id where vg.departure_id=v_order.departure_id and exists(select 1 from public.trip_rooms tr where tr.vehicle_group_id=vg.id and tr.status in('frozen','open')) and va.planned_passengers-coalesce((select sum(o.seat_count) from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=vg.id and o.status in('paid','confirmed')),0)>=v_order.seat_count order by va.sequence limit 1 for update of va;
 if v_group is null then return false;end if;insert into public.vehicle_group_orders(vehicle_group_id,order_id) values(v_group,p_order) on conflict(order_id) do nothing;update public.vehicle_assignments set booked_seats=coalesce((select sum(o.seat_count) from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=v_group and o.status in('paid','confirmed')),0) where id=v_assignment;update public.fulfilment_work_items set status='completed',updated_at=now() where order_id=p_order and kind='paid_order_ready' and status in('pending','assigned');return true;
end$$;

drop function if exists public.get_operations_dashboard_departures(date,date);
create function public.get_operations_dashboard_departures(p_from date default ((now() at time zone 'Asia/Tokyo')::date-30),p_to date default ((now() at time zone 'Asia/Tokyo')::date+365))
returns table(id uuid,trip_title text,departs_at timestamptz,ends_at timestamptz,capacity integer,status text,meeting_name text,order_count bigint,booked_seats bigint,pending_orders bigint,gross_amount_jpy bigint,booking_closes_at timestamptz,chat_opens_at timestamptz,dispatch_planning_status text,requires_manual_review boolean)
language sql stable security definer set search_path=public,pg_temp as $$
 select d.id,t.title,d.departs_at,d.ends_at,d.capacity,d.status,d.meeting_name,count(o.id),coalesce(sum(case when o.status in('paid','confirmed') then o.seat_count else 0 end),0)::bigint,count(o.id) filter(where o.status='pending_payment'),coalesce(sum(case when o.status in('paid','confirmed') and o.currency='JPY' then o.amount else 0 end),0)::bigint,d.booking_closes_at,d.chat_opens_at,d.dispatch_planning_status,d.dispatch_planning_status='needs_manual_review'
 from public.departures d join public.trips t on t.id=d.trip_id left join public.orders o on o.departure_id=d.id where public.is_operations() and (d.departs_at at time zone 'Asia/Tokyo')::date between p_from and p_to group by d.id,t.title order by d.departs_at nulls last;
$$;

create or replace function public.get_operations_orders(p_from date default null,p_to date default null,p_status text default null,p_order uuid default null)
returns table(order_id uuid,created_at timestamptz,order_status text,departure_id uuid,trip_title text,departs_at timestamptz,passenger_count bigint,seat_count integer,amount_jpy integer,gross_amount_jpy integer,discount_amount_jpy integer,referral_code text,vehicle_group_id uuid,vehicle_label text,driver_name text,refund_status text,refunded_amount_jpy integer)
language sql stable security definer set search_path=public,pg_temp as $$
 select o.id,o.created_at,o.status::text,d.id,t.title,d.departs_at,count(distinct p.id),o.seat_count,coalesce(o.amount,0),coalesce(o.gross_amount,o.amount,0),coalesce(o.discount_amount,0),rr.referral_code,vg.id,va.vehicle_label,dr.display_name,ocr.status,coalesce(o.refunded_amount_jpy,0)
 from public.orders o join public.departures d on d.id=o.departure_id join public.trips t on t.id=d.trip_id left join public.passengers p on p.order_id=o.id left join public.referral_relationships rr on rr.invitee_account_id=o.account_id left join public.vehicle_group_orders vgo on vgo.order_id=o.id left join public.vehicle_groups vg on vg.id=vgo.vehicle_group_id left join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id left join public.staff_assignments sa on sa.vehicle_group_id=vg.id and sa.role='driver' left join public.driver_resources dr on dr.account_id=sa.staff_id left join lateral(select r.status::text from public.order_cancellation_requests r where r.order_id=o.id order by r.requested_at desc limit 1) ocr on true
 where public.is_operations() and (p_from is null or (d.departs_at at time zone 'Asia/Tokyo')::date>=p_from) and (p_to is null or (d.departs_at at time zone 'Asia/Tokyo')::date<=p_to) and (p_status is null or o.status::text=p_status) and (p_order is null or o.id=p_order)
 group by o.id,d.id,t.id,rr.referral_code,vg.id,va.id,dr.id,ocr.status order by o.created_at desc;
$$;

create or replace function public.operations_update_fleet_vehicle_v2(p_vehicle uuid,p_status text,p_color text,p_photo_url text,p_model_name text,p_inspection_required boolean,p_operations_note text,p_sellable_capacity integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$declare v public.fleet_vehicles%rowtype;
begin
 if not public.is_operations() then raise exception 'operations role required';end if;select * into v from public.fleet_vehicles where id=p_vehicle for update;if not found then raise exception 'vehicle not found';end if;
 if p_status not in('available','assigned','in_service','maintenance','inactive') or p_sellable_capacity not between 1 and 100 then raise exception 'invalid vehicle update';end if;
 if p_status='available' and coalesce(p_inspection_required,false) then raise exception 'inspection-required vehicle cannot be available';end if;
 if exists(select 1 from public.dispatch_tasks where fleet_vehicle_id=p_vehicle and status in('confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress') and (payload->>'passengerCount')::integer>p_sellable_capacity) then raise exception 'capacity below active dispatch plan';end if;
 update public.fleet_vehicles set status=p_status::public.fleet_vehicle_status,public_color=nullif(trim(coalesce(p_color,'')),''),public_photo_url=nullif(trim(coalesce(p_photo_url,'')),''),model_name=nullif(trim(coalesce(p_model_name,'')),''),inspection_required=coalesce(p_inspection_required,false),operations_note=trim(coalesce(p_operations_note,'')),sellable_capacity=p_sellable_capacity,updated_at=now() where id=p_vehicle;
 insert into public.account_audit_events(actor_id,action,target_type,target_id,metadata)values(auth.uid(),'fleet_vehicle_updated','fleet_vehicle',p_vehicle,jsonb_build_object('priorStatus',v.status,'newStatus',p_status,'priorCapacity',v.sellable_capacity,'newCapacity',p_sellable_capacity));return true;
end$$;

revoke all on function public.operations_save_dispatch_plan(uuid,jsonb),public.finalize_dispatch_departure(uuid),public.try_allocate_paid_order(uuid),public.get_operations_dashboard_departures(date,date),public.get_operations_orders(date,date,text,uuid),public.operations_update_fleet_vehicle_v2(uuid,text,text,text,text,boolean,text,integer) from public,anon;
grant execute on function public.operations_save_dispatch_plan(uuid,jsonb),public.get_operations_dashboard_departures(date,date),public.get_operations_orders(date,date,text,uuid),public.operations_update_fleet_vehicle_v2(uuid,text,text,text,text,boolean,text,integer) to authenticated,service_role;
revoke all on function public.finalize_dispatch_departure(uuid),public.try_allocate_paid_order(uuid) from authenticated;
grant execute on function public.try_allocate_paid_order(uuid) to service_role;

commit;
