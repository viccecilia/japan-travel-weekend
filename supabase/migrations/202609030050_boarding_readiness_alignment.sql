begin;

create or replace function public.ensure_boarding_for_eligible_order()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status in ('paid','confirmed') then
    insert into public.boardings(order_id,status) values(new.id,'not_issued') on conflict(order_id) do nothing;
  end if;
  return new;
end$$;
drop trigger if exists ensure_boarding_after_order_insert_trigger on public.orders;
drop trigger if exists ensure_boarding_after_order_status_trigger on public.orders;
create trigger ensure_boarding_after_order_insert_trigger after insert on public.orders
for each row execute function public.ensure_boarding_for_eligible_order();
create trigger ensure_boarding_after_order_status_trigger after update of status on public.orders
for each row when(new.status in ('paid','confirmed') and old.status is distinct from new.status)
execute function public.ensure_boarding_for_eligible_order();

insert into public.boardings(order_id,status)
select o.id,'not_issued' from public.orders o where o.status in ('paid','confirmed')
on conflict(order_id) do nothing;

create or replace function public.get_own_order_fulfilment(p_order uuid)
returns table(order_id uuid,departure_id uuid,departs_at timestamptz,meeting_name text,meeting_address text,map_lat numeric,map_lng numeric,vehicle_group_id uuid,trip_room_id uuid,boarding_ready boolean)
language sql stable security definer set search_path=public,pg_temp as $$
  select o.id,d.id,d.departs_at,d.meeting_name,d.meeting_address,d.map_lat,d.map_lng,vgo.vehicle_group_id,tr.id,
    (o.status in ('paid','confirmed') and vgo.vehicle_group_id is not null and tr.status='open' and b.status in ('not_issued','issued'))
  from public.orders o join public.departures d on d.id=o.departure_id
  left join public.vehicle_group_orders vgo on vgo.order_id=o.id
  left join public.trip_rooms tr on tr.vehicle_group_id=vgo.vehicle_group_id
  left join public.boardings b on b.order_id=o.id
  where o.id=p_order and o.account_id=auth.uid();
$$;

revoke all on function public.ensure_boarding_for_eligible_order() from public,anon,authenticated,service_role;
revoke all on function public.get_own_order_fulfilment(uuid) from public,anon;
grant execute on function public.get_own_order_fulfilment(uuid) to authenticated,service_role;

commit;
