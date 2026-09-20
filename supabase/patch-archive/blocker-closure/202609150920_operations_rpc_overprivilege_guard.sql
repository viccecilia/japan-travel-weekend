begin;

create or replace function public.get_operations_dashboard_departures(p_from date default ((now() at time zone 'Asia/Tokyo')::date - 30), p_to date default ((now() at time zone 'Asia/Tokyo')::date + 365))
returns table(id uuid,trip_title text,departs_at timestamptz,ends_at timestamptz,capacity integer,status text,meeting_name text,order_count bigint,pending_orders bigint,gross_amount_jpy bigint,booking_closes_at timestamptz,chat_opens_at timestamptz,dispatch_planning_status text,requires_manual_review boolean)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then
    raise exception 'operations only';
  end if;

  return query
    select d.id,t.title,d.departs_at,d.ends_at,d.capacity,d.status,d.meeting_name,count(o.id),coalesce(sum(case when o.status in('paid','confirmed') then o.seat_count else 0 end),0)::bigint,count(o.id) filter(where o.status='pending_payment'),coalesce(sum(case when o.status in('paid','confirmed') and o.currency='JPY' then o.amount else 0 end),0)::bigint,d.booking_closes_at,d.chat_opens_at,d.dispatch_planning_status,d.dispatch_planning_status='needs_manual_review'
    from public.departures d
    join public.trips t on t.id=d.trip_id
    left join public.orders o on o.departure_id=d.id
   where (d.departs_at at time zone 'Asia/Tokyo')::date between p_from and p_to
   group by d.id,t.title
   order by d.departs_at nulls last;
end;
$$;

create or replace function public.get_operations_orders(p_from date default null,p_to date default null,p_status text default null,p_order uuid default null)
returns table(order_id uuid,created_at timestamptz,order_status text,departure_id uuid,trip_title text,departs_at timestamptz,passenger_count bigint,seat_count integer,amount_jpy integer,gross_amount_jpy integer,discount_amount_jpy integer,referral_code text,vehicle_group_id uuid,vehicle_label text,driver_name text,refund_status text,refunded_amount_jpy integer)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then
    raise exception 'operations only';
  end if;

  return query
    select o.id,o.created_at,o.status::text,d.id,t.title,d.departs_at,count(distinct p.id),o.seat_count,coalesce(o.amount,0),coalesce(o.gross_amount,o.amount,0),coalesce(o.discount_amount,0),rr.referral_code,vg.id,va.vehicle_label,dr.display_name,ocr.status,coalesce(o.refunded_amount_jpy,0)
    from public.orders o
    join public.departures d on d.id=o.departure_id
    join public.trips t on t.id=d.trip_id
    left join public.passengers p on p.order_id=o.id
    left join public.referral_relationships rr on rr.invitee_account_id=o.account_id
    left join public.vehicle_group_orders vgo on vgo.order_id=o.id
    left join public.vehicle_groups vg on vg.id=vgo.vehicle_group_id
    left join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id
    left join public.staff_assignments sa on sa.vehicle_group_id=vg.id and sa.role='driver'
    left join public.driver_resources dr on dr.account_id=sa.staff_id
    left join lateral(select r.status::text from public.order_cancellation_requests r where r.order_id=o.id order by r.requested_at desc limit 1) ocr on true
   where (p_from is null or (d.departs_at at time zone 'Asia/Tokyo')::date>=p_from)
     and (p_to is null or (d.departs_at at time zone 'Asia/Tokyo')::date<=p_to)
     and (p_status is null or o.status::text=p_status)
     and (p_order is null or o.id=p_order)
   group by o.id,d.id,t.id,rr.referral_code,vg.id,va.id,dr.id,ocr.status
   order by o.created_at desc;
end;
$$;

create or replace function public.get_operations_daily_run_board(p_service_date date)
returns table(departure_id uuid,trip_title text,departs_at timestamptz,departure_status text,vehicle_group_id uuid,vehicle_label text,driver_name text,capacity integer,booked_seats bigint,arrived bigint,boarded bigint,journey_status text,current_stop text,open_incidents bigint,last_event_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then
    raise exception 'operations only';
  end if;

  return query
    select d.id,t.title,d.departs_at,d.status,vg.id,coalesce(fv.registration_identifier,va.vehicle_type||' #'||va.sequence),dr.display_name,coalesce(va.capacity,d.capacity),
      case when vg.id is null then coalesce(departure_bookings.seats,0) else coalesce(group_bookings.seats,0) end,
      coalesce(attendance.arrived,0),coalesce(attendance.boarded,0),
      case
        when js.updated_at is not null and js.updated_at < ((d.departs_at at time zone 'Asia/Tokyo')::date::timestamp at time zone 'Asia/Tokyo') then 'data_inconsistent'
        else coalesce(js.status,'preparing')
      end,
      case
        when js.updated_at is not null and js.updated_at < ((d.departs_at at time zone 'Asia/Tokyo')::date::timestamp at time zone 'Asia/Tokyo') then null
        else js.current_stop_name
      end,
      coalesce(incidents.open_count,0),events.last_event_at
    from public.departures d
    join public.trips t on t.id=d.trip_id
    left join public.vehicle_groups vg on vg.departure_id=d.id
    left join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id
    left join lateral(
      select dt.*
      from public.dispatch_tasks dt
      where dt.vehicle_assignment_id=va.id
        and dt.status not in ('draft','rejected','cancelled','failed')
      order by dt.updated_at desc
      limit 1
    ) dt on true
    left join public.fleet_vehicles fv on fv.id=dt.fleet_vehicle_id
    left join public.driver_resources dr on dr.id=dt.driver_id
    left join public.vehicle_group_journey_state js on js.vehicle_group_id=vg.id
    left join lateral(select sum(o.seat_count)::bigint seats from public.orders o where o.departure_id=d.id and o.status in ('paid','confirmed')) departure_bookings on true
    left join lateral(
      select sum(o.seat_count)::bigint seats
      from public.vehicle_group_orders vgo
      join public.orders o on o.id=vgo.order_id
      where vgo.vehicle_group_id=vg.id
        and o.status in ('paid','confirmed')
    ) group_bookings on true
    left join lateral(
      select count(distinct pc.passenger_id) filter(where pc.status in ('arrived','boarded'))::bigint arrived,
             count(distinct pc.passenger_id) filter(where pc.status='boarded')::bigint boarded
      from public.passenger_checkins pc
      join public.orders o on o.id=pc.order_id
      where pc.vehicle_group_id=vg.id
        and o.status in ('paid','confirmed')
    ) attendance on true
    left join lateral(
      select count(*)::bigint open_count
      from public.operational_incidents oi
      where (oi.vehicle_group_id=vg.id or (oi.vehicle_group_id is null and oi.departure_id=d.id))
        and oi.resolved_at is null
    ) incidents on true
    left join lateral(
      select max(se.created_at) last_event_at
      from public.staff_execution_events se
      where se.vehicle_group_id=vg.id
    ) events on true
   where (d.departs_at at time zone 'Asia/Tokyo')::date = p_service_date
   order by d.departs_at,va.sequence nulls first;
end;
$$;

create or replace function public.get_operations_vehicle_group_changes(p_vehicle_group uuid)
returns table(
  id uuid,vehicle_group_id uuid,expected_group_version integer,status text,reason text,
  prior_vehicle_id uuid,prior_vehicle_code text,requested_vehicle_id uuid,requested_vehicle_code text,
  prior_driver_id uuid,prior_driver_name text,requested_driver_id uuid,requested_driver_name text,
  requested_at timestamptz,applied_at timestamptz,applied_group_version integer,
  notification_status text,notification_attempts integer,notification_last_error text
)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then
    raise exception 'operations only';
  end if;

  return query
    select r.id,r.vehicle_group_id,r.expected_group_version,r.status,r.reason,
      r.prior_vehicle_id,r.prior_vehicle_code,r.requested_vehicle_id,r.requested_vehicle_code,
      r.prior_driver_id,r.prior_driver_name,r.requested_driver_id,r.requested_driver_name,
      r.requested_at,r.applied_at,r.applied_group_version,
      r.notification_status,r.notification_attempts,r.notification_last_error
    from public.vehicle_group_change_requests r
    where r.vehicle_group_id=p_vehicle_group
    order by r.requested_at desc,r.id desc;
end;
$$;

create or replace function public.get_operations_departure_calendar(p_from date,p_to date)
returns table(
  id uuid,trip_id uuid,trip_title text,departs_at timestamptz,ends_at timestamptz,
  seat_price_jpy integer,capacity integer,sales_open_at timestamptz,sales_close_at timestamptz,
  booking_closes_at timestamptz,status text,schedule_version integer,paid_passengers bigint,
  paid_orders bigint,meeting_name text,meeting_address text,map_lat numeric,map_lng numeric,
  dispatch_planning_status text,vehicles jsonb
)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then
    raise exception 'operations only';
  end if;

  return query
    select d.id,d.trip_id,t.title,d.departs_at,d.ends_at,d.seat_price_jpy,d.capacity,
      d.sales_open_at,d.sales_close_at,d.booking_closes_at,d.status,d.schedule_version,
      coalesce(ord.paid_passengers,0),coalesce(ord.paid_orders,0),d.meeting_name,
      d.meeting_address,d.map_lat,d.map_lng,d.dispatch_planning_status,
      coalesce(assignments.vehicles,'[]'::jsonb)
    from public.departures d
    join public.trips t on t.id=d.trip_id
    left join lateral(
      select coalesce(sum(o.seat_count),0)::bigint paid_passengers,count(*)::bigint paid_orders
      from public.orders o
      where o.departure_id=d.id and o.status in('paid','confirmed')
    ) ord on true
    left join lateral(
      select jsonb_agg(jsonb_build_object(
        'assignmentId',va.id,'sequence',va.sequence,'plannedPassengers',va.planned_passengers,
        'bookedPassengers',coalesce(va.booked_seats,0),'assignmentCapacity',va.capacity,
        'vehicleType',va.vehicle_type,'vehicleLabel',va.vehicle_label,'taskId',task.id,
        'taskStatus',task.status,'driverId',task.driver_id,'vehicleId',task.fleet_vehicle_id,
        'startsAt',task.payload->>'startsAt','endsAt',task.payload->>'endsAt',
        'vehicleCode',fv.registration_identifier,'vehicleModel',fv.model_name,
        'sellableCapacity',fv.sellable_capacity,'driverName',dr.display_name,
        'vehicleGroupId',vg.id,'roomId',tr.id,'groupVersion',coalesce(vg.operations_version,1),
        'journeyStatus',js.status
      ) order by va.sequence) vehicles
      from public.vehicle_assignments va
      left join lateral(
        select dt.*
        from public.dispatch_tasks dt
        where dt.vehicle_assignment_id=va.id
        order by dt.created_at desc,dt.id desc
        limit 1
      ) task on true
      left join public.fleet_vehicles fv on fv.id=task.fleet_vehicle_id
      left join public.driver_resources dr on dr.id=task.driver_id
      left join public.vehicle_groups vg on vg.vehicle_assignment_id=va.id
      left join public.trip_rooms tr on tr.vehicle_group_id=vg.id
      left join public.vehicle_group_journey_state js on js.vehicle_group_id=vg.id
      where va.departure_id=d.id
    ) assignments on true
   where (d.departs_at at time zone 'Asia/Tokyo')::date between p_from and p_to
   order by d.departs_at,d.id;
end;
$$;

create or replace function public.get_operations_vip_charter_requests()
returns table(request_id uuid,account_id uuid,departure_id uuid,trip_id uuid,trip_title text,service_date date,passenger_count integer,vehicle_type text,base_seat_price_jpy integer,pricing_factor integer,pickup_fee_jpy integer,total_jpy integer,pickup_ward text,pickup_address text,return_address text,special_requests text,status text,created_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then
    raise exception 'operations only';
  end if;

  return query
    select r.id,r.account_id,r.departure_id,r.trip_id,t.title,r.service_date,r.passenger_count,r.vehicle_type,r.base_seat_price_jpy,r.pricing_factor,r.pickup_fee_jpy,r.total_jpy,r.pickup_ward,r.pickup_address,r.return_address,r.special_requests,r.status,r.created_at
      from public.vip_charter_requests r
      join public.trips t on t.id=r.trip_id
   order by r.created_at desc;
end;
$$;

commit;
