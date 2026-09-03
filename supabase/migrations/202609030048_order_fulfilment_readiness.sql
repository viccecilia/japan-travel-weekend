begin;
drop function if exists public.get_own_order_fulfilment(uuid);
create function public.get_own_order_fulfilment(p_order uuid)
returns table(order_id uuid,departure_id uuid,departs_at timestamptz,meeting_name text,meeting_address text,map_lat numeric,map_lng numeric,vehicle_group_id uuid,trip_room_id uuid,boarding_ready boolean)
language sql stable security definer set search_path=public,pg_temp as $$
  select o.id,d.id,d.departs_at,d.meeting_name,d.meeting_address,d.map_lat,d.map_lng,vgo.vehicle_group_id,tr.id,
    (o.status in ('paid','confirmed') and vgo.vehicle_group_id is not null and tr.status in ('frozen','open'))
  from public.orders o join public.departures d on d.id=o.departure_id
  left join public.vehicle_group_orders vgo on vgo.order_id=o.id
  left join public.trip_rooms tr on tr.vehicle_group_id=vgo.vehicle_group_id
  where o.id=p_order and o.account_id=auth.uid();
$$;
revoke all on function public.get_own_order_fulfilment(uuid) from public,anon;
grant execute on function public.get_own_order_fulfilment(uuid) to authenticated,service_role;
commit;
