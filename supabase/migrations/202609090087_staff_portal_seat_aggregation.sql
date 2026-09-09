begin;

drop function if exists public.get_staff_portal_tasks();
create function public.get_staff_portal_tasks()
returns table(
  staff_assignment_id uuid,assignment_role text,vehicle_group_id uuid,room_id uuid,room_status text,
  departure_id uuid,trip_title text,departs_at timestamptz,chat_opens_at timestamptz,
  meeting_name text,meeting_address text,map_lat numeric,map_lng numeric,vehicle_sequence integer,
  vehicle_type text,vehicle_label text,vehicle_capacity integer,booked_seats integer,passenger_count integer,
  boarded_count integer
)
language sql stable security definer set search_path=public,pg_temp as $$
  select sa.id,sa.role::text,vg.id,tr.id,tr.status,d.id,t.title,d.departs_at,d.chat_opens_at,
    d.meeting_name,d.meeting_address,d.map_lat,d.map_lng,va.sequence,va.vehicle_type,va.vehicle_label,va.capacity,
    coalesce((select sum(o2.seat_count) from public.vehicle_group_orders vgo2 join public.orders o2 on o2.id=vgo2.order_id where vgo2.vehicle_group_id=vg.id and o2.status in ('paid','confirmed')),0)::integer,
    count(distinct p.id) filter(where o.status in ('paid','confirmed'))::integer,
    count(distinct p.id) filter(where o.status in ('paid','confirmed') and pc.status='boarded')::integer
  from public.staff_assignments sa join public.vehicle_groups vg on vg.id=sa.vehicle_group_id
  join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id join public.departures d on d.id=vg.departure_id
  join public.trips t on t.id=d.trip_id left join public.trip_rooms tr on tr.vehicle_group_id=vg.id
  left join public.vehicle_group_orders vgo on vgo.vehicle_group_id=vg.id left join public.orders o on o.id=vgo.order_id
  left join public.passengers p on p.order_id=o.id left join public.passenger_checkins pc on pc.passenger_id=p.id
  where sa.staff_id=auth.uid() and sa.role in ('driver','guide','operations')
  group by sa.id,vg.id,tr.id,d.id,t.id,va.id order by d.departs_at nulls last,va.sequence;
$$;

revoke all on function public.get_staff_portal_tasks() from public,anon;
grant execute on function public.get_staff_portal_tasks() to authenticated,service_role;

commit;
