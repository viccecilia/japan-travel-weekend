begin;

create or replace function public.finalize_dispatch_departure(p_departure uuid)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_task record;
  v_order record;
  v_group uuid;
  v_room_open timestamptz;
begin
  if not public.is_operations() then
    raise exception 'operations only';
  end if;

  if exists(
    select 1
    from public.dispatch_tasks dt
    join public.vehicle_assignments va on va.id=dt.vehicle_assignment_id
    where va.departure_id=p_departure and dt.status='draft'
  ) then
    return false;
  end if;

  if (
    select coalesce(sum(va.planned_passengers),0)
    from public.vehicle_assignments va
    join public.dispatch_tasks dt on dt.vehicle_assignment_id=va.id
    where va.departure_id=p_departure
      and dt.status in('confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress','completed')
  )<>(
    select coalesce(sum(o.seat_count),0)
    from public.orders o
    where o.departure_id=p_departure and o.status in('paid','confirmed')
  ) then
    raise exception 'dispatch plan must assign every committed passenger exactly once';
  end if;

  select coalesce(
    d.chat_opens_at,
    (((d.departs_at at time zone 'Asia/Tokyo')::date-1)+time '12:00') at time zone 'Asia/Tokyo'
  )
  into v_room_open
  from public.departures d
  where d.id=p_departure
  for update;

  if v_room_open is null then
    raise exception 'departure time required before fulfilment';
  end if;

  for v_task in
    select dt.id task_id,dt.driver_id,dr.account_id,va.id assignment_id,va.sequence,fv.registration_identifier
    from public.dispatch_tasks dt
    join public.vehicle_assignments va on va.id=dt.vehicle_assignment_id
    join public.driver_resources dr on dr.id=dt.driver_id
    left join public.fleet_vehicles fv on fv.id=dt.fleet_vehicle_id
    where va.departure_id=p_departure
      and dt.status in('confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress','completed')
    order by va.sequence
  loop
    update public.vehicle_assignments
    set vehicle_label=coalesce(v_task.registration_identifier,vehicle_label)
    where id=v_task.assignment_id;

    insert into public.vehicle_groups(departure_id,vehicle_assignment_id)
    values(p_departure,v_task.assignment_id)
    on conflict(vehicle_assignment_id) do update set departure_id=excluded.departure_id
    returning id into v_group;

    insert into public.trip_rooms(vehicle_group_id,opens_at,status)
    values(v_group,v_room_open,case when v_room_open<=now() then 'open' else 'frozen' end)
    on conflict(vehicle_group_id) do update
      set opens_at=excluded.opens_at,
          status=case
            when public.trip_rooms.status='closed' then 'closed'
            when excluded.opens_at<=now() then 'open'
            else 'frozen'
          end;

    if v_task.account_id is not null then
      insert into public.staff_assignments(vehicle_group_id,staff_id,role)
      values(v_group,v_task.account_id,'driver')
      on conflict(vehicle_group_id,staff_id) do update set role='driver';
    end if;
  end loop;

  -- Keep each order intact. Allocate larger orders first, then use the smallest
  -- remaining vehicle plan that can hold the whole order. This avoids the
  -- false 4-then-5 failure for valid 5+4 plans without weakening capacity rules.
  for v_order in
    select o.id,o.seat_count
    from public.orders o
    where o.departure_id=p_departure
      and o.status in('paid','confirmed')
      and not exists(
        select 1 from public.vehicle_group_orders vgo where vgo.order_id=o.id
      )
    order by o.seat_count desc,o.created_at,o.id
  loop
    select candidate.id
    into v_group
    from (
      select
        vg.id,
        va.sequence,
        va.planned_passengers-coalesce((
          select sum(o2.seat_count)
          from public.vehicle_group_orders vgo2
          join public.orders o2 on o2.id=vgo2.order_id
          where vgo2.vehicle_group_id=vg.id
            and o2.status in('paid','confirmed')
        ),0) as remaining_seats
      from public.vehicle_groups vg
      join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id
      where vg.departure_id=p_departure
    ) candidate
    where candidate.remaining_seats>=v_order.seat_count
    order by candidate.remaining_seats,candidate.sequence
    limit 1;

    if v_group is null then
      raise exception 'order cannot fit within vehicle plan without splitting: %',v_order.id;
    end if;

    insert into public.vehicle_group_orders(vehicle_group_id,order_id)
    values(v_group,v_order.id);
  end loop;

  update public.vehicle_assignments va
  set booked_seats=coalesce((
    select sum(o.seat_count)
    from public.vehicle_group_orders vgo
    join public.orders o on o.id=vgo.order_id
    join public.vehicle_groups vg on vg.id=vgo.vehicle_group_id
    where vg.vehicle_assignment_id=va.id and o.status in('paid','confirmed')
  ),0)
  where va.departure_id=p_departure;

  update public.departures
  set dispatch_planning_status='confirmed',updated_at=now()
  where id=p_departure;

  return true;
end
$$;

revoke all on function public.finalize_dispatch_departure(uuid) from public,anon,authenticated;

commit;
