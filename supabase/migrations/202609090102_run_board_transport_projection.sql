begin;

drop function if exists public.get_operations_driver_transport_statistics(date,date);
create function public.get_operations_driver_transport_statistics(p_from date,p_to date)
returns table(driver_id uuid,driver_name text,service_role text,assigned_runs bigint,completed_runs bigint,sold_passengers bigint,assigned_passengers bigint,boarded_passengers bigint,completed_passengers bigint,available_seats bigint,load_factor numeric,open_incidents bigint,last_location_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  with current_tasks as (
    select distinct on (va.id) dt.id,dt.driver_id,va.capacity,vg.id vehicle_group_id,js.status journey_status
    from public.vehicle_assignments va join public.vehicle_groups vg on vg.vehicle_assignment_id=va.id join public.departures d on d.id=vg.departure_id
    join public.dispatch_tasks dt on dt.vehicle_assignment_id=va.id left join public.vehicle_group_journey_state js on js.vehicle_group_id=vg.id
    where (d.departs_at at time zone 'Asia/Tokyo')::date between p_from and p_to and dt.status not in ('draft','rejected','cancelled','failed')
    order by va.id,dt.updated_at desc
  ), metrics as (
    select a.*,coalesce(s.people,0) people,coalesce(b.people,0) boarded
    from current_tasks a
    left join lateral(select count(distinct p.id) people from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id join public.passengers p on p.order_id=o.id where vgo.vehicle_group_id=a.vehicle_group_id and o.status in ('paid','confirmed')) s on true
    left join lateral(select count(distinct pc.passenger_id) people from public.passenger_checkins pc join public.orders o on o.id=pc.order_id where pc.vehicle_group_id=a.vehicle_group_id and pc.status='boarded' and o.status in ('paid','confirmed')) b on true
  )
  select dr.id,dr.display_name,dr.service_role::text,count(distinct m.id),count(distinct m.id) filter(where m.journey_status='completed'),coalesce(sum(m.people),0),coalesce(sum(m.people),0),coalesce(sum(m.boarded),0),coalesce(sum(m.boarded) filter(where m.journey_status='completed'),0),coalesce(sum(m.capacity),0),case when coalesce(sum(m.capacity),0)>0 then round(100.0*sum(m.boarded)/sum(m.capacity),1) else 0 end,count(distinct oi.id) filter(where oi.resolved_at is null),max(lp.recorded_at)
  from public.driver_resources dr left join metrics m on m.driver_id=dr.id
  left join public.operational_incidents oi on oi.vehicle_group_id=m.vehicle_group_id
  left join lateral(select max(p.recorded_at) recorded_at from public.driver_location_points p where p.vehicle_group_id=m.vehicle_group_id and p.staff_id=dr.account_id) lp on true
  where public.is_operations() group by dr.id,dr.display_name,dr.service_role order by 5 desc,4 desc,dr.display_name
$$;

create or replace function public.get_operations_daily_run_board(p_service_date date)
returns table(departure_id uuid,trip_title text,departs_at timestamptz,departure_status text,vehicle_group_id uuid,vehicle_label text,driver_name text,capacity integer,booked_seats bigint,arrived bigint,boarded bigint,journey_status text,current_stop text,open_incidents bigint,last_event_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select d.id,t.title,d.departs_at,d.status,vg.id,coalesce(fv.registration_identifier,va.vehicle_type||' #'||va.sequence),dr.display_name,coalesce(va.capacity,d.capacity),
    case when vg.id is null then coalesce(departure_bookings.seats,0) else coalesce(group_bookings.seats,0) end,
    coalesce(attendance.arrived,0),coalesce(attendance.boarded,0),coalesce(js.status,'preparing'),js.current_stop_name,coalesce(incidents.open_count,0),events.last_event_at
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

revoke all on function public.get_operations_driver_transport_statistics(date,date),public.get_operations_daily_run_board(date) from public,anon;
grant execute on function public.get_operations_driver_transport_statistics(date,date),public.get_operations_daily_run_board(date) to authenticated,service_role;

commit;
