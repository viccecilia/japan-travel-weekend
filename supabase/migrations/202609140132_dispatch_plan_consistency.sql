begin;

-- Migration 129 introduced an explicit planned passenger count. Older rows were
-- initially backfilled from vehicle capacity, which can make a 9-seat vehicle
-- look as though 9 passengers were planned even when only 4 paid passengers
-- belong to the vehicle group. Normalize only departures whose aggregate plan
-- exceeds the current paid/confirmed commitment. Existing group allocations are
-- retained and no order, payment, passenger, or audit row is removed.
with departure_totals as (
  select va.departure_id,
    sum(va.planned_passengers)::integer as planned,
    coalesce((
      select sum(o.seat_count)::integer
      from public.orders o
      where o.departure_id=va.departure_id and o.status in ('paid','confirmed')
    ),0) as committed
  from public.vehicle_assignments va
  group by va.departure_id
), assignment_bookings as (
  select va.id,
    coalesce((
      select sum(o.seat_count)::integer
      from public.vehicle_groups vg
      join public.vehicle_group_orders vgo on vgo.vehicle_group_id=vg.id
      join public.orders o on o.id=vgo.order_id and o.status in ('paid','confirmed')
      where vg.vehicle_assignment_id=va.id
    ),0) as booked
  from public.vehicle_assignments va
  join departure_totals total on total.departure_id=va.departure_id
  where total.planned>total.committed
)
update public.vehicle_assignments va
set planned_passengers=least(va.capacity,bookings.booked)
from assignment_bookings bookings
where bookings.id=va.id and va.planned_passengers<>least(va.capacity,bookings.booked);

-- A journey event before the Japanese service date cannot describe execution
-- of that departure. Keep the underlying history for audit, but expose a clear
-- review state instead of presenting stale fixture/history as a completed run.
create or replace function public.get_operations_daily_run_board(p_service_date date)
returns table(departure_id uuid,trip_title text,departs_at timestamptz,departure_status text,vehicle_group_id uuid,vehicle_label text,driver_name text,capacity integer,booked_seats bigint,arrived bigint,boarded bigint,journey_status text,current_stop text,open_incidents bigint,last_event_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select d.id,t.title,d.departs_at,d.status,vg.id,coalesce(fv.registration_identifier,va.vehicle_type||' #'||va.sequence),dr.display_name,coalesce(va.capacity,d.capacity),
    case when vg.id is null then coalesce(departure_bookings.seats,0) else coalesce(group_bookings.seats,0) end,
    coalesce(attendance.arrived,0),coalesce(attendance.boarded,0),
    case
      when js.updated_at is not null and js.updated_at<((d.departs_at at time zone 'Asia/Tokyo')::date::timestamp at time zone 'Asia/Tokyo') then 'data_inconsistent'
      else coalesce(js.status,'preparing')
    end,
    case
      when js.updated_at is not null and js.updated_at<((d.departs_at at time zone 'Asia/Tokyo')::date::timestamp at time zone 'Asia/Tokyo') then null
      else js.current_stop_name
    end,
    coalesce(incidents.open_count,0),events.last_event_at
  from public.departures d join public.trips t on t.id=d.trip_id
  left join public.vehicle_groups vg on vg.departure_id=d.id left join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id
  left join lateral(select dt.* from public.dispatch_tasks dt where dt.vehicle_assignment_id=va.id and dt.status not in ('draft','rejected','cancelled','failed') order by dt.updated_at desc limit 1) dt on true
  left join public.fleet_vehicles fv on fv.id=dt.fleet_vehicle_id left join public.driver_resources dr on dr.id=dt.driver_id left join public.vehicle_group_journey_state js on js.vehicle_group_id=vg.id
  left join lateral(select sum(o.seat_count)::bigint seats from public.orders o where o.departure_id=d.id and o.status in ('paid','confirmed')) departure_bookings on true
  left join lateral(select sum(o.seat_count)::bigint seats from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=vg.id and o.status in ('paid','confirmed')) group_bookings on true
  left join lateral(select count(distinct pc.passenger_id) filter(where pc.status in ('arrived','boarded'))::bigint arrived,count(distinct pc.passenger_id) filter(where pc.status='boarded')::bigint boarded from public.passenger_checkins pc join public.orders o on o.id=pc.order_id where pc.vehicle_group_id=vg.id and o.status in ('paid','confirmed')) attendance on true
  left join lateral(select count(*)::bigint open_count from public.operational_incidents oi where (oi.vehicle_group_id=vg.id or (oi.vehicle_group_id is null and oi.departure_id=d.id)) and oi.resolved_at is null) incidents on true
  left join lateral(select max(se.created_at) last_event_at from public.staff_execution_events se where se.vehicle_group_id=vg.id) events on true
  where public.is_operations() and (d.departs_at at time zone 'Asia/Tokyo')::date=p_service_date order by d.departs_at,va.sequence nulls first
$$;

revoke all on function public.get_operations_daily_run_board(date) from public,anon;
grant execute on function public.get_operations_daily_run_board(date) to authenticated,service_role;

commit;
