begin;

create or replace function public.get_accessible_trip_room_by_group(p_vehicle_group uuid)
returns table(
  room_id uuid,vehicle_group_id uuid,room_status text,opens_at timestamptz,
  departure_id uuid,departs_at timestamptz,meeting_name text,meeting_address text,
  map_lat numeric,map_lng numeric,vehicle_sequence integer,vehicle_type text,
  vehicle_label text,vehicle_capacity integer,booked_seats integer,
  boarded_orders integer,total_orders integer
)
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
begin
  return query
  select r.id,vg.id,r.status,r.opens_at,d.id,d.departs_at,d.meeting_name,d.meeting_address,d.map_lat,d.map_lng,
    va.sequence,va.vehicle_type,va.vehicle_label,va.capacity,va.booked_seats,
    count(*) filter(where b.status='boarded')::integer,count(vgo.order_id)::integer
  from public.trip_rooms r
  join public.vehicle_groups vg on vg.id=r.vehicle_group_id
  join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id
  join public.departures d on d.id=vg.departure_id
  left join public.vehicle_group_orders vgo on vgo.vehicle_group_id=vg.id
  left join public.orders o on o.id=vgo.order_id
  left join public.boardings b on b.order_id=o.id
  where vg.id=p_vehicle_group
    and (public.is_operations() or public.is_group_staff(vg.id) or public.is_vehicle_group_member(vg.id))
  group by r.id,vg.id,d.id,va.id;
end$$;

revoke all on function public.get_accessible_trip_room_by_group(uuid) from public,anon;
grant execute on function public.get_accessible_trip_room_by_group(uuid) to authenticated,service_role;

create or replace function public.get_operations_system_release_info()
returns table(migration_version text,database_time timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  return query select '202609140142'::text,now() where public.is_operations();
end$$;

revoke all on function public.get_operations_system_release_info() from public,anon;
grant execute on function public.get_operations_system_release_info() to authenticated,service_role;

commit;
