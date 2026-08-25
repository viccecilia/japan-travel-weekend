begin;
create or replace function public.mark_vehicle_group_order_boarded(p_vehicle_group uuid,p_order uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not(public.is_operations() or public.is_group_staff(p_vehicle_group)) then raise exception 'assigned staff only'; end if;
  if not exists(select 1 from public.trip_rooms where vehicle_group_id=p_vehicle_group and status='open') then raise exception 'trip room is not open'; end if;
  if not exists(select 1 from public.vehicle_group_orders where vehicle_group_id=p_vehicle_group and order_id=p_order) then raise exception 'order is not in vehicle group'; end if;
  insert into public.boardings(order_id,status,boarded_at) values(p_order,'boarded',now())
    on conflict(order_id) do update set status='boarded',boarded_at=coalesce(public.boardings.boarded_at,excluded.boarded_at),updated_at=now();
  return true;
end$$;
revoke all on function public.mark_vehicle_group_order_boarded(uuid,uuid) from public,anon;
grant execute on function public.mark_vehicle_group_order_boarded(uuid,uuid) to authenticated,service_role;
commit;
