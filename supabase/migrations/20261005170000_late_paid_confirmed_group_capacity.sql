begin;

-- A payment can arrive after Operations has already confirmed a departure.
-- In that case the saved planned passenger count reflects the earlier paid
-- total, while the selected vehicle may still have physical sellable seats.
-- Allocate against the real vehicle capacity and grow the confirmed plan to
-- the reconciled paid total atomically. This keeps the normal payment trigger
-- and Operations retry action authoritative; no manual membership write is
-- required.
create or replace function public.try_allocate_paid_order(p_order uuid)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_group uuid;
  v_assignment uuid;
  v_booked integer;
begin
  select * into v_order from public.orders where id=p_order for update;
  if v_order.id is null or v_order.status not in ('paid','confirmed') then
    return false;
  end if;

  if exists (select 1 from public.vehicle_group_orders where order_id=p_order) then
    update public.fulfilment_work_items
    set status='completed',updated_at=now()
    where order_id=p_order and kind='paid_order_ready' and status in ('pending','assigned');
    return true;
  end if;

  select vg.id,va.id into v_group,v_assignment
  from public.vehicle_groups vg
  join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id
  where vg.departure_id=v_order.departure_id
    and exists (
      select 1 from public.trip_rooms tr
      where tr.vehicle_group_id=vg.id and tr.status in ('frozen','open')
    )
    and va.capacity-coalesce((
      select sum(o.seat_count)
      from public.vehicle_group_orders vgo
      join public.orders o on o.id=vgo.order_id
      where vgo.vehicle_group_id=vg.id and o.status in ('paid','confirmed')
    ),0)>=v_order.seat_count
  order by va.sequence
  limit 1
  for update of va;

  if v_group is null then return false; end if;

  insert into public.vehicle_group_orders(vehicle_group_id,order_id)
  values(v_group,p_order)
  on conflict(order_id) do nothing;

  select coalesce(sum(o.seat_count),0)::integer into v_booked
  from public.vehicle_group_orders vgo
  join public.orders o on o.id=vgo.order_id
  where vgo.vehicle_group_id=v_group and o.status in ('paid','confirmed');

  update public.vehicle_assignments
  set booked_seats=v_booked,
      planned_passengers=greatest(planned_passengers,v_booked)
  where id=v_assignment;

  update public.fulfilment_work_items
  set status='completed',updated_at=now()
  where order_id=p_order and kind='paid_order_ready' and status in ('pending','assigned');
  return true;
end
$$;

revoke all on function public.try_allocate_paid_order(uuid) from public,anon,authenticated;
grant execute on function public.try_allocate_paid_order(uuid) to service_role;

commit;
