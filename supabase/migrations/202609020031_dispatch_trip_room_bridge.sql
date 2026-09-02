begin;

create or replace function public.finalize_dispatch_departure(p_departure uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_task record;
  v_order record;
  v_group uuid;
  v_room_open timestamptz;
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if exists(
    select 1 from public.dispatch_tasks dt join public.vehicle_assignments va on va.id=dt.vehicle_assignment_id
    where va.departure_id=p_departure and dt.status='draft'
  ) then return false; end if;
  if not exists(
    select 1 from public.dispatch_tasks dt join public.vehicle_assignments va on va.id=dt.vehicle_assignment_id
    where va.departure_id=p_departure and dt.status in ('confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress','completed')
  ) then return false; end if;

  select greatest(d.departs_at-interval '24 hours',now()) into v_room_open from public.departures d where d.id=p_departure for update;
  if v_room_open is null then raise exception 'departure time required before fulfilment'; end if;

  for v_task in
    select dt.id task_id,dt.driver_id,dr.account_id,va.id assignment_id,va.sequence,fv.registration_identifier
    from public.dispatch_tasks dt
    join public.vehicle_assignments va on va.id=dt.vehicle_assignment_id
    join public.driver_resources dr on dr.id=dt.driver_id
    left join public.fleet_vehicles fv on fv.id=dt.fleet_vehicle_id
    where va.departure_id=p_departure and dt.status in ('confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress','completed')
    order by va.sequence
  loop
    update public.vehicle_assignments set vehicle_label=coalesce(v_task.registration_identifier,vehicle_label) where id=v_task.assignment_id;
    insert into public.vehicle_groups(departure_id,vehicle_assignment_id) values(p_departure,v_task.assignment_id)
      on conflict(vehicle_assignment_id) do update set departure_id=excluded.departure_id returning id into v_group;
    insert into public.trip_rooms(vehicle_group_id,opens_at,status)
      values(v_group,v_room_open,case when v_room_open<=now() then 'open' else 'frozen' end)
      on conflict(vehicle_group_id) do nothing;
    if v_task.account_id is not null then
      insert into public.staff_assignments(vehicle_group_id,staff_id,role) values(v_group,v_task.account_id,'driver')
        on conflict(vehicle_group_id,staff_id) do update set role='driver';
    end if;
  end loop;

  for v_order in
    select o.id,o.seat_count from public.orders o
    where o.departure_id=p_departure and o.status in ('paid','confirmed')
      and not exists(select 1 from public.vehicle_group_orders vgo where vgo.order_id=o.id)
    order by o.created_at,o.id
  loop
    select vg.id into v_group
    from public.vehicle_groups vg join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id
    where vg.departure_id=p_departure
      and va.capacity-coalesce((select sum(o2.seat_count) from public.vehicle_group_orders vgo2 join public.orders o2 on o2.id=vgo2.order_id where vgo2.vehicle_group_id=vg.id),0)>=v_order.seat_count
    order by va.sequence limit 1;
    if v_group is null then raise exception 'order cannot fit without splitting: %',v_order.id; end if;
    insert into public.vehicle_group_orders(vehicle_group_id,order_id) values(v_group,v_order.id);
  end loop;
  update public.vehicle_assignments va set booked_seats=coalesce((select sum(o.seat_count) from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id join public.vehicle_groups vg on vg.id=vgo.vehicle_group_id where vg.vehicle_assignment_id=va.id),0) where va.departure_id=p_departure;
  return true;
end$$;

create or replace function public.operations_confirm_dispatch_tasks(p_task_ids uuid[])
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare changed integer; v_departure uuid;
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if coalesce(array_length(p_task_ids,1),0)=0 then raise exception 'no dispatch tasks'; end if;
  insert into public.dispatch_task_audit(dispatch_task_id,actor_id,action,from_status,to_status,detail)
    select id,auth.uid(),'confirmed','draft','confirmed','{}' from public.dispatch_tasks where id=any(p_task_ids) and status='draft';
  update public.dispatch_tasks set status='confirmed',confirmed_by=auth.uid(),confirmed_at=now(),updated_at=now() where id=any(p_task_ids) and status='draft';
  get diagnostics changed=row_count;
  if changed<>array_length(p_task_ids,1) then raise exception 'all tasks must be draft'; end if;
  update public.fleet_vehicles set status='assigned',updated_at=now() where id in(select fleet_vehicle_id from public.dispatch_tasks where id=any(p_task_ids));
  for v_departure in select distinct va.departure_id from public.dispatch_tasks dt join public.vehicle_assignments va on va.id=dt.vehicle_assignment_id where dt.id=any(p_task_ids)
  loop perform public.finalize_dispatch_departure(v_departure); end loop;
  return changed;
end$$;

create or replace function public.operations_cancel_dispatch_tasks(p_task_ids uuid[],p_reason text)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare changed integer;
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if coalesce(array_length(p_task_ids,1),0)=0 or length(trim(p_reason)) not between 3 and 300 then raise exception 'invalid cancellation'; end if;
  insert into public.dispatch_task_audit(dispatch_task_id,actor_id,action,from_status,to_status,detail)
    select id,auth.uid(),'cancelled',status,'cancelled',jsonb_build_object('reason',trim(p_reason),'externalCancellationRequired',external_task_id is not null and external_task_id not like 'mock-%') from public.dispatch_tasks where id=any(p_task_ids) and status in ('draft','confirmed','sent','failed');
  update public.dispatch_tasks set status='cancelled',last_error=null,updated_at=now() where id=any(p_task_ids) and status in ('draft','confirmed','sent','failed');
  get diagnostics changed=row_count;
  if changed<>array_length(p_task_ids,1) then raise exception 'task cannot be cancelled'; end if;
  delete from public.staff_assignments sa using public.vehicle_groups vg,public.dispatch_tasks dt,public.driver_resources dr
    where dt.id=any(p_task_ids) and vg.vehicle_assignment_id=dt.vehicle_assignment_id and dr.id=dt.driver_id and dr.account_id is not null and sa.vehicle_group_id=vg.id and sa.staff_id=dr.account_id;
  update public.fleet_vehicles v set status='available',updated_at=now() where v.id in(select fleet_vehicle_id from public.dispatch_tasks where id=any(p_task_ids)) and not exists(select 1 from public.dispatch_tasks t where t.fleet_vehicle_id=v.id and t.status in ('confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress'));
  return changed;
end$$;

revoke all on function public.finalize_dispatch_departure(uuid),public.operations_confirm_dispatch_tasks(uuid[]),public.operations_cancel_dispatch_tasks(uuid[],text) from public,anon;
grant execute on function public.operations_confirm_dispatch_tasks(uuid[]),public.operations_cancel_dispatch_tasks(uuid[],text) to authenticated;
revoke all on function public.finalize_dispatch_departure(uuid) from authenticated;

commit;
