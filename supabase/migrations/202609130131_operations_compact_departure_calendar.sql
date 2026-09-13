begin;

create or replace function public.get_operations_departure_calendar(p_from date,p_to date)
returns table(
  id uuid,trip_id uuid,trip_title text,departs_at timestamptz,ends_at timestamptz,
  seat_price_jpy integer,capacity integer,sales_open_at timestamptz,sales_close_at timestamptz,
  booking_closes_at timestamptz,status text,schedule_version integer,paid_passengers bigint,
  paid_orders bigint,meeting_name text,meeting_address text,map_lat numeric,map_lng numeric,
  dispatch_planning_status text,vehicles jsonb
)
language sql stable security definer set search_path=public,pg_temp as $$
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
      'assignmentCapacity',va.capacity,'vehicleType',va.vehicle_type,'vehicleLabel',va.vehicle_label,
      'taskId',task.id,'taskStatus',task.status,'driverId',task.driver_id,
      'vehicleId',task.fleet_vehicle_id,'startsAt',task.payload->>'startsAt','endsAt',task.payload->>'endsAt',
      'vehicleCode',fv.registration_identifier,'vehicleModel',fv.model_name,
      'sellableCapacity',fv.sellable_capacity,'driverName',dr.display_name
    ) order by va.sequence) vehicles
    from public.vehicle_assignments va
    left join lateral(
      select dt.* from public.dispatch_tasks dt where dt.vehicle_assignment_id=va.id
      order by dt.created_at desc,dt.id desc limit 1
    ) task on true
    left join public.fleet_vehicles fv on fv.id=task.fleet_vehicle_id
    left join public.driver_resources dr on dr.id=task.driver_id
    where va.departure_id=d.id
  ) assignments on true
  where public.is_operations()
    and (d.departs_at at time zone 'Asia/Tokyo')::date between p_from and p_to
  order by d.departs_at,d.id;
$$;

revoke all on function public.get_operations_departure_calendar(date,date) from public,anon;
grant execute on function public.get_operations_departure_calendar(date,date) to authenticated,service_role;

commit;
