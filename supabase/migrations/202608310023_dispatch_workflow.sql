begin;

create or replace function public.operations_save_dispatch_plan(p_departure uuid,p_tasks jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare item jsonb; assignment_id uuid; task_id uuid; existing_status public.dispatch_task_status; result jsonb:='[]'::jsonb;
  sequence_value integer; capacity_value integer; passenger_value integer; vehicle_type_value text; driver_value uuid; fleet_value uuid;
  starts_value timestamptz; ends_value timestamptz; idempotency_value text;
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if not exists(select 1 from public.departures where id=p_departure) then raise exception 'unknown departure'; end if;
  if jsonb_typeof(p_tasks)<>'array' or jsonb_array_length(p_tasks) not between 1 and 20 then raise exception 'invalid dispatch plan'; end if;
  if (select count(distinct value->>'driverId') from jsonb_array_elements(p_tasks))<>jsonb_array_length(p_tasks)
    or (select count(distinct value->>'fleetVehicleId') from jsonb_array_elements(p_tasks))<>jsonb_array_length(p_tasks)
    or (select count(distinct value->>'sequence') from jsonb_array_elements(p_tasks))<>jsonb_array_length(p_tasks) then raise exception 'duplicate dispatch resource'; end if;
  for item in select value from jsonb_array_elements(p_tasks) loop
    sequence_value:=(item->>'sequence')::integer; capacity_value:=(item->>'capacity')::integer; passenger_value:=(item->>'passengerCount')::integer;
    vehicle_type_value:=item->>'vehicleType'; driver_value:=(item->>'driverId')::uuid; fleet_value:=(item->>'fleetVehicleId')::uuid;
    starts_value:=(item->>'startsAt')::timestamptz; ends_value:=(item->>'endsAt')::timestamptz;
    if sequence_value<1 or capacity_value<1 or passenger_value<0 or passenger_value>capacity_value or ends_value<=starts_value then raise exception 'invalid dispatch task'; end if;
    if not exists(select 1 from public.vehicle_type_configs where type_key=vehicle_type_value and active and sellable_capacity=capacity_value) then raise exception 'invalid vehicle type'; end if;
    if not exists(select 1 from public.fleet_vehicles where id=fleet_value and vehicle_type_key=vehicle_type_value and status='available') then raise exception 'vehicle unavailable'; end if;
    if not exists(select 1 from public.driver_resources d join public.driver_vehicle_qualifications q on q.driver_id=d.id and q.vehicle_type_key=vehicle_type_value join public.driver_availability_windows w on w.driver_id=d.id and w.starts_at<=starts_value and w.ends_at>=ends_value where d.id=driver_value and d.status='available') then raise exception 'driver unavailable or unqualified'; end if;
    insert into public.vehicle_assignments(departure_id,sequence,vehicle_type,capacity)
      values(p_departure,sequence_value,vehicle_type_value,capacity_value)
      on conflict(departure_id,sequence) do update set vehicle_type=excluded.vehicle_type,capacity=excluded.capacity
      returning id into assignment_id;
    idempotency_value:='dispatch:'||p_departure::text||':'||sequence_value::text;
    select id,status into task_id,existing_status from public.dispatch_tasks where idempotency_key=idempotency_value for update;
    if exists(select 1 from public.dispatch_tasks t where (task_id is null or t.id<>task_id) and t.status in ('confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress') and (t.driver_id=driver_value or t.fleet_vehicle_id=fleet_value) and (t.payload->>'startsAt')::timestamptz<ends_value and (t.payload->>'endsAt')::timestamptz>starts_value) then raise exception 'dispatch resource time conflict'; end if;
    if task_id is null then
      insert into public.dispatch_tasks(vehicle_assignment_id,driver_id,fleet_vehicle_id,idempotency_key,payload)
        values(assignment_id,driver_value,fleet_value,idempotency_value,jsonb_build_object('startsAt',starts_value,'endsAt',ends_value,'vehicleType',vehicle_type_value,'capacity',capacity_value,'passengerCount',passenger_value,'operationalNotes',coalesce(item->'operationalNotes','[]'::jsonb))) returning id into task_id;
      insert into public.dispatch_task_audit(dispatch_task_id,actor_id,action,to_status,detail) values(task_id,auth.uid(),'draft_created','draft',jsonb_build_object('source','operations_dashboard'));
    elsif existing_status='draft' then
      update public.dispatch_tasks set vehicle_assignment_id=assignment_id,driver_id=driver_value,fleet_vehicle_id=fleet_value,payload=jsonb_build_object('startsAt',starts_value,'endsAt',ends_value,'vehicleType',vehicle_type_value,'capacity',capacity_value,'passengerCount',passenger_value,'operationalNotes',coalesce(item->'operationalNotes','[]'::jsonb)),last_error=null,updated_at=now() where id=task_id;
      insert into public.dispatch_task_audit(dispatch_task_id,actor_id,action,from_status,to_status,detail) values(task_id,auth.uid(),'draft_updated','draft','draft','{}');
    else raise exception 'only draft tasks can be replaced'; end if;
    result:=result||jsonb_build_array(task_id);
  end loop;
  return result;
end$$;

create or replace function public.operations_confirm_dispatch_tasks(p_task_ids uuid[])
returns integer language plpgsql security definer set search_path=public,pg_temp as $$declare changed integer;begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if coalesce(array_length(p_task_ids,1),0)=0 then raise exception 'no dispatch tasks'; end if;
  insert into public.dispatch_task_audit(dispatch_task_id,actor_id,action,from_status,to_status,detail)
    select id,auth.uid(),'confirmed','draft','confirmed','{}' from public.dispatch_tasks where id=any(p_task_ids) and status='draft';
  update public.dispatch_tasks set status='confirmed',confirmed_by=auth.uid(),confirmed_at=now(),updated_at=now() where id=any(p_task_ids) and status='draft';
  get diagnostics changed=row_count;
  if changed<>array_length(p_task_ids,1) then raise exception 'all tasks must be draft'; end if;
  update public.fleet_vehicles set status='assigned',updated_at=now() where id in(select fleet_vehicle_id from public.dispatch_tasks where id=any(p_task_ids));
  return changed;
end$$;

create or replace function public.operations_simulate_dispatch_send(p_task_ids uuid[])
returns integer language plpgsql security definer set search_path=public,pg_temp as $$declare changed integer;begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if coalesce(array_length(p_task_ids,1),0)=0 then raise exception 'no dispatch tasks'; end if;
  insert into public.dispatch_task_audit(dispatch_task_id,actor_id,action,from_status,to_status,detail)
    select id,auth.uid(),'mock_sent','confirmed','sent',jsonb_build_object('provider','memory','externalNetwork',false) from public.dispatch_tasks where id=any(p_task_ids) and status='confirmed';
  update public.dispatch_tasks set status='sent',external_task_id='mock-'||id::text,sent_at=now(),last_error=null,updated_at=now() where id=any(p_task_ids) and status='confirmed';
  get diagnostics changed=row_count;
  if changed<>array_length(p_task_ids,1) then raise exception 'all tasks must be confirmed'; end if;
  return changed;
end$$;

create or replace function public.operations_cancel_dispatch_tasks(p_task_ids uuid[],p_reason text)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$declare changed integer;begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if coalesce(array_length(p_task_ids,1),0)=0 or length(trim(p_reason)) not between 3 and 300 then raise exception 'invalid cancellation'; end if;
  insert into public.dispatch_task_audit(dispatch_task_id,actor_id,action,from_status,to_status,detail)
    select id,auth.uid(),'cancelled',status,'cancelled',jsonb_build_object('reason',trim(p_reason),'externalCancellationRequired',external_task_id is not null and external_task_id not like 'mock-%') from public.dispatch_tasks where id=any(p_task_ids) and status in ('draft','confirmed','sent','failed');
  update public.dispatch_tasks set status='cancelled',last_error=null,updated_at=now() where id=any(p_task_ids) and status in ('draft','confirmed','sent','failed');
  get diagnostics changed=row_count;
  if changed<>array_length(p_task_ids,1) then raise exception 'task cannot be cancelled'; end if;
  update public.fleet_vehicles v set status='available',updated_at=now() where v.id in(select fleet_vehicle_id from public.dispatch_tasks where id=any(p_task_ids)) and not exists(select 1 from public.dispatch_tasks t where t.fleet_vehicle_id=v.id and t.status in ('confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress'));
  return changed;
end$$;

revoke all on function public.operations_save_dispatch_plan(uuid,jsonb),public.operations_confirm_dispatch_tasks(uuid[]),public.operations_simulate_dispatch_send(uuid[]),public.operations_cancel_dispatch_tasks(uuid[],text) from public,anon;
grant execute on function public.operations_save_dispatch_plan(uuid,jsonb),public.operations_confirm_dispatch_tasks(uuid[]),public.operations_simulate_dispatch_send(uuid[]),public.operations_cancel_dispatch_tasks(uuid[],text) to authenticated;

commit;
