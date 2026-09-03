begin;

create or replace function public.try_allocate_paid_order(p_order uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order public.orders%rowtype;v_group uuid;v_assignment uuid;
begin
  select * into v_order from public.orders where id=p_order for update;
  if v_order.id is null or v_order.status not in ('paid','confirmed') then return false; end if;
  if exists(select 1 from public.vehicle_group_orders where order_id=p_order) then
    update public.fulfilment_work_items set status='completed',updated_at=now() where order_id=p_order and kind='paid_order_ready' and status in ('pending','assigned');
    return true;
  end if;
  select vg.id,va.id into v_group,v_assignment
  from public.vehicle_groups vg join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id
  where vg.departure_id=v_order.departure_id
    and exists(select 1 from public.trip_rooms tr where tr.vehicle_group_id=vg.id and tr.status in ('frozen','open'))
    and va.capacity-coalesce((select sum(o.seat_count) from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=vg.id and o.status in ('paid','confirmed')),0)>=v_order.seat_count
  order by va.sequence limit 1 for update of va;
  if v_group is null then return false; end if;
  insert into public.vehicle_group_orders(vehicle_group_id,order_id) values(v_group,p_order) on conflict(order_id) do nothing;
  update public.vehicle_assignments set booked_seats=coalesce((select sum(o.seat_count) from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=v_group and o.status in ('paid','confirmed')),0) where id=v_assignment;
  update public.fulfilment_work_items set status='completed',updated_at=now() where order_id=p_order and kind='paid_order_ready' and status in ('pending','assigned');
  return true;
end$$;

create or replace function public.allocate_paid_fulfilment_item()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.kind='paid_order_ready' and new.status='pending' and public.try_allocate_paid_order(new.order_id) then new.status:='completed';new.updated_at:=now(); end if;
  return new;
end$$;
drop trigger if exists allocate_paid_fulfilment_item_trigger on public.fulfilment_work_items;
create trigger allocate_paid_fulfilment_item_trigger before insert on public.fulfilment_work_items for each row execute function public.allocate_paid_fulfilment_item();

create or replace function public.operations_retry_paid_fulfilment(p_order uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  return public.try_allocate_paid_order(p_order);
end$$;

revoke all on function public.try_allocate_paid_order(uuid),public.allocate_paid_fulfilment_item(),public.operations_retry_paid_fulfilment(uuid) from public,anon,authenticated;
grant execute on function public.operations_retry_paid_fulfilment(uuid) to authenticated,service_role;
grant execute on function public.try_allocate_paid_order(uuid) to service_role;
revoke all on function public.allocate_paid_fulfilment_item() from service_role;
commit;
