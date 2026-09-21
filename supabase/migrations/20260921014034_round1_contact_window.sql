-- Keep contact data private. An open chat alone never opens the phone window.
create or replace function public.get_staff_passenger_contact(p_vehicle_group uuid,p_passenger uuid)
returns table(contact_name text,phone text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_order uuid;
  v_departs_at timestamptz;
  v_contact_after integer;
  v_contact public.order_contact_private%rowtype;
begin
  if auth.uid() is null or not(public.is_operations() or public.is_group_staff(p_vehicle_group)) then
    raise exception 'assigned staff only';
  end if;
  if not public.is_vehicle_group_executable(p_vehicle_group)
    or not exists(select 1 from public.trip_rooms where vehicle_group_id=p_vehicle_group and status='open')
    or exists(select 1 from public.vehicle_group_journey_state where vehicle_group_id=p_vehicle_group and status='completed') then
    raise exception 'contact details not available';
  end if;
  select p.order_id,d.departs_at,c.staff_contact_minutes_after into v_order,v_departs_at,v_contact_after
  from public.passengers p
  join public.vehicle_group_orders vgo on vgo.order_id=p.order_id and vgo.vehicle_group_id=p_vehicle_group
  join public.orders o on o.id=p.order_id and o.status in ('paid','confirmed')
  join public.vehicle_groups vg on vg.id=vgo.vehicle_group_id
  join public.departures d on d.id=vg.departure_id
  cross join public.trip_attendance_config c
  where p.id=p_passenger and c.singleton;
  if v_order is null then raise exception 'passenger is not in vehicle group'; end if;
  if not exists(select 1 from public.vehicle_group_meeting_state where vehicle_group_id=p_vehicle_group and status='active')
    and (v_departs_at is null or v_contact_after is null or now()<v_departs_at+make_interval(mins=>v_contact_after)) then
    raise exception 'contact details not yet available';
  end if;
  select oc.* into v_contact from public.order_contact_private oc where oc.order_id=v_order;
  if v_contact.order_id is null then return; end if;
  insert into public.passenger_contact_access_audit(actor_id,order_id,passenger_id,vehicle_group_id,purpose)
  values(auth.uid(),v_order,p_passenger,p_vehicle_group,'attendance_contact');
  return query select v_contact.contact_name,v_contact.phone;
end$$;
revoke all on function public.get_staff_passenger_contact(uuid,uuid) from public,anon;
grant execute on function public.get_staff_passenger_contact(uuid,uuid) to authenticated,service_role;
