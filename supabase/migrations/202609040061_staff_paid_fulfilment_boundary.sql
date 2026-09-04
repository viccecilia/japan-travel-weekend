begin;

-- Staff receive fulfilment-ready passengers only. Payment review and refund
-- decisions remain exclusively in the operations/payment domain.
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
    d.meeting_name,d.meeting_address,d.map_lat,d.map_lng,va.sequence,va.vehicle_type,
    va.vehicle_label,va.capacity,
    coalesce(sum(o.seat_count) filter(where o.status in ('paid','confirmed')),0)::integer,
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

create or replace function public.get_vehicle_group_boarding_status(p_vehicle_group uuid)
returns table(order_id uuid,passenger_label text,seat_count integer,boarding_status text,boarded_at timestamptz,location_shared boolean)
language sql stable security definer set search_path=public,pg_temp as $$
  select o.id,'订单 '||right(o.id::text,6),o.seat_count,coalesce(b.status,'not_issued'),b.boarded_at,
    exists(select 1 from public.location_shares ls where ls.vehicle_group_id=p_vehicle_group and ls.subject_id=o.account_id and ls.stopped_at is null and ls.expires_at>now())
  from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id left join public.boardings b on b.order_id=o.id
  where vgo.vehicle_group_id=p_vehicle_group and o.status in ('paid','confirmed')
    and (public.is_operations() or public.is_group_staff(p_vehicle_group))
  order by o.created_at,o.id;
$$;

create or replace function public.get_vehicle_group_attendance(p_vehicle_group uuid)
returns table(passenger_id uuid,passenger_label text,order_id uuid,status text,status_at timestamptz,contact_status text,late_minutes integer)
language sql stable security definer set search_path=public,pg_temp as $$
  select p.id,case when public.is_operations() or public.is_group_staff(p_vehicle_group) then coalesce(nullif(p.display_name,''),'乘客') else coalesce(nullif(p.display_name,''),'本人乘客') end,p.order_id,coalesce(pc.status,'pending'),pc.status_at,
    case when public.is_operations() or public.is_group_staff(p_vehicle_group) then (select a.action from public.passenger_contact_actions a where a.checkin_id=pc.id order by a.created_at desc limit 1) else null end,
    pc.late_minutes
  from public.passengers p join public.orders o on o.id=p.order_id join public.vehicle_group_orders vgo on vgo.order_id=o.id left join public.passenger_checkins pc on pc.passenger_id=p.id
  where vgo.vehicle_group_id=p_vehicle_group and o.status in ('paid','confirmed')
    and (o.account_id=auth.uid() or public.is_operations() or public.is_group_staff(p_vehicle_group)) order by o.created_at,p.created_at;
$$;

revoke all on function public.get_staff_portal_tasks(),public.get_vehicle_group_boarding_status(uuid),public.get_vehicle_group_attendance(uuid) from public,anon;
grant execute on function public.get_staff_portal_tasks(),public.get_vehicle_group_boarding_status(uuid),public.get_vehicle_group_attendance(uuid) to authenticated,service_role;

commit;
