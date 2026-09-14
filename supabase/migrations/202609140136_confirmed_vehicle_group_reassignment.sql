begin;

alter table public.vehicle_groups
  add column if not exists operations_version integer not null default 1
    check (operations_version > 0);

create table if not exists public.vehicle_group_change_requests (
  id uuid primary key default gen_random_uuid(),
  vehicle_group_id uuid not null references public.vehicle_groups(id),
  expected_group_version integer not null check (expected_group_version > 0),
  prior_vehicle_id uuid not null references public.fleet_vehicles(id),
  prior_driver_id uuid not null references public.driver_resources(id),
  requested_vehicle_id uuid not null references public.fleet_vehicles(id),
  requested_driver_id uuid not null references public.driver_resources(id),
  reason text not null check (length(trim(reason)) between 5 and 500),
  status text not null default 'pending' check (status in ('pending','applied','cancelled')),
  idempotency_key uuid not null unique,
  requested_by uuid not null references public.profiles(id),
  requested_at timestamptz not null default now(),
  applied_by uuid references public.profiles(id),
  applied_at timestamptz,
  notification_status text not null default 'not_requested'
    check (notification_status in ('not_requested','pending','sent','failed','suppressed_test')),
  notification_attempts integer not null default 0 check (notification_attempts >= 0),
  notification_last_error text,
  applied_group_version integer,
  prior_vehicle_code text,
  requested_vehicle_code text,
  prior_driver_name text,
  requested_driver_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vehicle_group_change_one_pending
  on public.vehicle_group_change_requests(vehicle_group_id)
  where status='pending';

alter table public.vehicle_group_change_requests enable row level security;
drop policy if exists vehicle_group_change_operations_read on public.vehicle_group_change_requests;
create policy vehicle_group_change_operations_read
  on public.vehicle_group_change_requests for select to authenticated
  using (public.is_operations());

create or replace function public.operations_request_vehicle_group_change(
  p_vehicle_group uuid,
  p_expected_group_version integer,
  p_requested_vehicle uuid,
  p_requested_driver uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_group public.vehicle_groups%rowtype;
  v_task public.dispatch_tasks%rowtype;
  v_prior_vehicle public.fleet_vehicles%rowtype;
  v_new_vehicle public.fleet_vehicles%rowtype;
  v_prior_driver public.driver_resources%rowtype;
  v_new_driver public.driver_resources%rowtype;
  v_existing public.vehicle_group_change_requests%rowtype;
  v_request uuid;
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if p_idempotency_key is null or length(trim(coalesce(p_reason,''))) not between 5 and 500 then
    raise exception 'change reason must be between 5 and 500 characters';
  end if;

  select * into v_existing from public.vehicle_group_change_requests where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.vehicle_group_id<>p_vehicle_group
      or v_existing.expected_group_version<>p_expected_group_version
      or v_existing.requested_vehicle_id<>p_requested_vehicle
      or v_existing.requested_driver_id<>p_requested_driver
      or v_existing.reason<>trim(p_reason) then
      raise exception 'idempotency key payload conflict';
    end if;
    return v_existing.id;
  end if;

  select * into v_group from public.vehicle_groups where id=p_vehicle_group for update;
  if not found then raise exception 'vehicle group not found'; end if;
  if v_group.operations_version<>p_expected_group_version then raise exception 'vehicle group version conflict'; end if;
  if exists(select 1 from public.vehicle_group_journey_state where vehicle_group_id=p_vehicle_group and status='completed')
    or exists(select 1 from public.departures where id=v_group.departure_id and status='completed') then
    raise exception 'completed vehicle group cannot be changed';
  end if;

  select dt.* into v_task
  from public.dispatch_tasks dt
  where dt.vehicle_assignment_id=v_group.vehicle_assignment_id
    and dt.status in ('confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress')
  order by dt.updated_at desc,dt.id desc limit 1;
  if not found then raise exception 'confirmed dispatch task not found'; end if;
  if v_task.fleet_vehicle_id is null then raise exception 'current vehicle is missing'; end if;
  if v_task.fleet_vehicle_id=p_requested_vehicle and v_task.driver_id=p_requested_driver then
    raise exception 'vehicle or driver must change';
  end if;

  select * into v_prior_vehicle from public.fleet_vehicles where id=v_task.fleet_vehicle_id;
  select * into v_new_vehicle from public.fleet_vehicles where id=p_requested_vehicle;
  select * into v_prior_driver from public.driver_resources where id=v_task.driver_id;
  select * into v_new_driver from public.driver_resources where id=p_requested_driver;
  if v_new_vehicle.id is null then raise exception 'requested vehicle not found'; end if;
  if v_new_driver.id is null then raise exception 'requested driver not found'; end if;

  insert into public.vehicle_group_change_requests(
    vehicle_group_id,expected_group_version,prior_vehicle_id,prior_driver_id,
    requested_vehicle_id,requested_driver_id,reason,idempotency_key,requested_by,
    prior_vehicle_code,requested_vehicle_code,prior_driver_name,requested_driver_name
  ) values (
    p_vehicle_group,p_expected_group_version,v_task.fleet_vehicle_id,v_task.driver_id,
    p_requested_vehicle,p_requested_driver,trim(p_reason),p_idempotency_key,auth.uid(),
    v_prior_vehicle.registration_identifier,v_new_vehicle.registration_identifier,
    v_prior_driver.display_name,v_new_driver.display_name
  ) returning id into v_request;
  return v_request;
end
$$;

create or replace function public.operations_apply_vehicle_group_change(p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_change public.vehicle_group_change_requests%rowtype;
  v_group public.vehicle_groups%rowtype;
  v_assignment public.vehicle_assignments%rowtype;
  v_task public.dispatch_tasks%rowtype;
  v_vehicle public.fleet_vehicles%rowtype;
  v_driver public.driver_resources%rowtype;
  v_old_driver_account uuid;
  v_new_driver_account uuid;
  v_old_staff_assignment uuid;
  v_new_staff_assignment uuid;
  v_starts timestamptz;
  v_ends timestamptz;
  v_required_capacity integer;
  v_next_version integer;
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  select * into v_change from public.vehicle_group_change_requests where id=p_request for update;
  if not found then raise exception 'vehicle group change request not found'; end if;
  if v_change.status='applied' then
    return jsonb_build_object('requestId',v_change.id,'vehicleGroupId',v_change.vehicle_group_id,
      'groupVersion',v_change.applied_group_version,'status','applied','idempotentReplay',true,
      'notificationStatus',v_change.notification_status);
  end if;
  if v_change.status<>'pending' then raise exception 'vehicle group change request is not pending'; end if;

  select * into v_group from public.vehicle_groups where id=v_change.vehicle_group_id for update;
  if not found then raise exception 'vehicle group not found'; end if;
  if v_group.operations_version<>v_change.expected_group_version then raise exception 'vehicle group version conflict'; end if;
  if exists(select 1 from public.vehicle_group_journey_state where vehicle_group_id=v_group.id and status='completed')
    or exists(select 1 from public.departures where id=v_group.departure_id and status='completed') then
    raise exception 'completed vehicle group cannot be changed';
  end if;

  select * into v_assignment from public.vehicle_assignments where id=v_group.vehicle_assignment_id for update;
  select dt.* into v_task from public.dispatch_tasks dt
  where dt.vehicle_assignment_id=v_assignment.id
    and dt.status in ('confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress')
  order by dt.updated_at desc,dt.id desc limit 1 for update;
  if not found then raise exception 'active confirmed dispatch task not found'; end if;
  if v_task.fleet_vehicle_id<>v_change.prior_vehicle_id or v_task.driver_id<>v_change.prior_driver_id then
    raise exception 'vehicle group version conflict';
  end if;
  v_starts:=(v_task.payload->>'startsAt')::timestamptz;
  v_ends:=(v_task.payload->>'endsAt')::timestamptz;
  if v_starts is null or v_ends is null or v_ends<=v_starts then raise exception 'dispatch schedule is invalid'; end if;

  select * into v_vehicle from public.fleet_vehicles where id=v_change.requested_vehicle_id for update;
  if not found or coalesce(v_vehicle.inspection_required,false)
    or (v_vehicle.id<>v_task.fleet_vehicle_id and v_vehicle.status<>'available') then
    raise exception 'requested vehicle is unavailable';
  end if;
  select greatest(v_assignment.planned_passengers,coalesce(sum(o.seat_count),0)::integer)
    into v_required_capacity
  from public.vehicle_group_orders vgo
  join public.orders o on o.id=vgo.order_id and o.status in ('paid','confirmed')
  where vgo.vehicle_group_id=v_group.id;
  v_required_capacity:=greatest(v_assignment.planned_passengers,coalesce(v_required_capacity,0));
  if v_vehicle.sellable_capacity<v_required_capacity then raise exception 'requested vehicle capacity is insufficient'; end if;
  if exists(select 1 from public.dispatch_tasks other
    where other.id<>v_task.id and other.fleet_vehicle_id=v_vehicle.id
      and other.status in ('confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress')
      and (other.payload->>'startsAt')::timestamptz<v_ends
      and (other.payload->>'endsAt')::timestamptz>v_starts) then
    raise exception 'requested vehicle has a time conflict';
  end if;

  select * into v_driver from public.driver_resources where id=v_change.requested_driver_id for update;
  if not found or v_driver.status<>'available' then raise exception 'requested driver is unavailable'; end if;
  if not exists(select 1 from public.driver_vehicle_qualifications q
    where q.driver_id=v_driver.id and q.vehicle_type_key=v_vehicle.vehicle_type_key
      and (q.expires_at is null or q.expires_at>=(v_starts at time zone 'Asia/Tokyo')::date)) then
    raise exception 'requested driver is not qualified for vehicle';
  end if;
  if not exists(select 1 from public.driver_availability_windows w
    where w.driver_id=v_driver.id and w.starts_at<=v_starts and w.ends_at>=v_ends) then
    raise exception 'requested driver is unavailable for schedule';
  end if;
  if exists(select 1 from public.dispatch_tasks other
    where other.id<>v_task.id and other.driver_id=v_driver.id
      and other.status in ('confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress')
      and (other.payload->>'startsAt')::timestamptz<v_ends
      and (other.payload->>'endsAt')::timestamptz>v_starts) then
    raise exception 'requested driver has a time conflict';
  end if;

  select account_id into v_old_driver_account from public.driver_resources where id=v_task.driver_id;
  select account_id into v_new_driver_account from public.driver_resources where id=v_driver.id;
  if v_new_driver_account is null then raise exception 'requested driver has no approved account'; end if;

  update public.dispatch_tasks
  set driver_id=v_driver.id,fleet_vehicle_id=v_vehicle.id,
      payload=jsonb_set(jsonb_set(jsonb_set(payload,'{vehicleType}',to_jsonb(v_vehicle.vehicle_type_key),true),
        '{capacity}',to_jsonb(v_vehicle.sellable_capacity),true),'{reassignmentRequestId}',to_jsonb(v_change.id::text),true),
      updated_at=now()
  where id=v_task.id;
  update public.vehicle_assignments
  set vehicle_type=v_vehicle.vehicle_type_key,capacity=v_vehicle.sellable_capacity,
      vehicle_label=v_vehicle.registration_identifier
  where id=v_assignment.id;

  if v_old_driver_account is not null and v_old_driver_account is distinct from v_new_driver_account then
    update public.staff_assignments
    set revoked_at=now(),revoked_by=auth.uid(),revocation_reason='vehicle group reassignment: '||v_change.reason
    where vehicle_group_id=v_group.id and staff_id=v_old_driver_account and role='driver' and revoked_at is null
    returning id into v_old_staff_assignment;
  end if;
  insert into public.staff_assignments(vehicle_group_id,staff_id,role,revoked_at,revoked_by,revocation_reason)
  values(v_group.id,v_new_driver_account,'driver',null,null,null)
  on conflict(vehicle_group_id,staff_id) do update
    set role='driver',revoked_at=null,revoked_by=null,revocation_reason=null
  returning id into v_new_staff_assignment;
  delete from public.staff_assignment_acknowledgements where staff_assignment_id=v_new_staff_assignment;

  update public.fleet_vehicles set status='assigned',updated_at=now() where id=v_vehicle.id;
  if v_task.fleet_vehicle_id is distinct from v_vehicle.id then
    update public.fleet_vehicles old_vehicle set status='available',updated_at=now()
    where old_vehicle.id=v_task.fleet_vehicle_id and not exists(select 1 from public.dispatch_tasks active
      where active.id<>v_task.id and active.fleet_vehicle_id=old_vehicle.id
        and active.status in ('confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress'));
  end if;

  v_next_version:=v_group.operations_version+1;
  update public.vehicle_groups set operations_version=v_next_version where id=v_group.id;
  update public.vehicle_group_change_requests
  set status='applied',applied_by=auth.uid(),applied_at=now(),updated_at=now(),
      applied_group_version=v_next_version,notification_status='pending',notification_attempts=1
  where id=v_change.id;
  insert into public.dispatch_task_audit(dispatch_task_id,actor_id,action,from_status,to_status,detail)
  values(v_task.id,auth.uid(),'vehicle_group_reassigned',v_task.status,v_task.status,
    jsonb_build_object('requestId',v_change.id,'vehicleGroupId',v_group.id,'reason',v_change.reason,
      'priorVehicleId',v_change.prior_vehicle_id,'newVehicleId',v_vehicle.id,
      'priorDriverId',v_change.prior_driver_id,'newDriverId',v_driver.id,
      'priorGroupVersion',v_change.expected_group_version,'newGroupVersion',v_next_version,
      'notificationStatus','pending'));
  return jsonb_build_object('requestId',v_change.id,'vehicleGroupId',v_group.id,
    'groupVersion',v_next_version,'status','applied','idempotentReplay',false,
    'notificationStatus','pending','driverAcknowledgementRequired',true);
end
$$;

create or replace function public.operations_retry_vehicle_group_change_notification(p_request uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer;
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  update public.vehicle_group_change_requests
  set notification_status='pending',notification_attempts=notification_attempts+1,
      notification_last_error=null,updated_at=now()
  where id=p_request and status='applied' and notification_status='failed';
  get diagnostics v_count=row_count;
  if v_count<>1 then raise exception 'failed notification is not available for retry'; end if;
  return v_count;
end$$;

create or replace function public.get_operations_vehicle_group_changes(p_vehicle_group uuid)
returns table(
  id uuid,vehicle_group_id uuid,expected_group_version integer,status text,reason text,
  prior_vehicle_id uuid,prior_vehicle_code text,requested_vehicle_id uuid,requested_vehicle_code text,
  prior_driver_id uuid,prior_driver_name text,requested_driver_id uuid,requested_driver_name text,
  requested_at timestamptz,applied_at timestamptz,applied_group_version integer,
  notification_status text,notification_attempts integer,notification_last_error text
)
language sql stable security definer set search_path=public,pg_temp as $$
  select r.id,r.vehicle_group_id,r.expected_group_version,r.status,r.reason,
    r.prior_vehicle_id,r.prior_vehicle_code,r.requested_vehicle_id,r.requested_vehicle_code,
    r.prior_driver_id,r.prior_driver_name,r.requested_driver_id,r.requested_driver_name,
    r.requested_at,r.applied_at,r.applied_group_version,
    r.notification_status,r.notification_attempts,r.notification_last_error
  from public.vehicle_group_change_requests r
  where public.is_operations() and r.vehicle_group_id=p_vehicle_group
  order by r.requested_at desc,r.id desc;
$$;

drop function if exists public.get_operations_departure_calendar(date,date);
create function public.get_operations_departure_calendar(p_from date,p_to date)
returns table(
  id uuid,trip_id uuid,trip_title text,departs_at timestamptz,ends_at timestamptz,
  seat_price_jpy integer,capacity integer,sales_open_at timestamptz,sales_close_at timestamptz,
  booking_closes_at timestamptz,status text,schedule_version integer,paid_passengers bigint,
  paid_orders bigint,meeting_name text,meeting_address text,map_lat numeric,map_lng numeric,
  dispatch_planning_status text,vehicles jsonb
)
language sql stable security definer set search_path=public,pg_temp as $$
  select d.id,d.trip_id,t.title,d.departs_at,d.ends_at,d.seat_price_jpy,d.capacity,
    d.sales_open_at,d.sales_close_at,d.booking_closes_at,d.status,d.schedule_version,
    coalesce(ord.paid_passengers,0),coalesce(ord.paid_orders,0),d.meeting_name,
    d.meeting_address,d.map_lat,d.map_lng,d.dispatch_planning_status,
    coalesce(assignments.vehicles,'[]'::jsonb)
  from public.departures d join public.trips t on t.id=d.trip_id
  left join lateral(
    select coalesce(sum(o.seat_count),0)::bigint paid_passengers,count(*)::bigint paid_orders
    from public.orders o where o.departure_id=d.id and o.status in('paid','confirmed')
  ) ord on true
  left join lateral(
    select jsonb_agg(jsonb_build_object(
      'assignmentId',va.id,'sequence',va.sequence,'plannedPassengers',va.planned_passengers,
      'bookedPassengers',coalesce(va.booked_seats,0),'assignmentCapacity',va.capacity,
      'vehicleType',va.vehicle_type,'vehicleLabel',va.vehicle_label,'taskId',task.id,
      'taskStatus',task.status,'driverId',task.driver_id,'vehicleId',task.fleet_vehicle_id,
      'startsAt',task.payload->>'startsAt','endsAt',task.payload->>'endsAt',
      'vehicleCode',fv.registration_identifier,'vehicleModel',fv.model_name,
      'sellableCapacity',fv.sellable_capacity,'driverName',dr.display_name,
      'vehicleGroupId',vg.id,'roomId',tr.id,'groupVersion',coalesce(vg.operations_version,1),
      'journeyStatus',js.status
    ) order by va.sequence) vehicles
    from public.vehicle_assignments va
    left join lateral(select dt.* from public.dispatch_tasks dt where dt.vehicle_assignment_id=va.id order by dt.created_at desc,dt.id desc limit 1) task on true
    left join public.fleet_vehicles fv on fv.id=task.fleet_vehicle_id
    left join public.driver_resources dr on dr.id=task.driver_id
    left join public.vehicle_groups vg on vg.vehicle_assignment_id=va.id
    left join public.trip_rooms tr on tr.vehicle_group_id=vg.id
    left join public.vehicle_group_journey_state js on js.vehicle_group_id=vg.id
    where va.departure_id=d.id
  ) assignments on true
  where public.is_operations() and (d.departs_at at time zone 'Asia/Tokyo')::date between p_from and p_to
  order by d.departs_at,d.id;
$$;

create or replace function public.get_operations_system_release_info()
returns table(migration_version text,database_time timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select '202609140136',now() where public.is_operations()
$$;

revoke all on public.vehicle_group_change_requests from public,anon,authenticated;
grant select on public.vehicle_group_change_requests to authenticated;
revoke all on function public.operations_request_vehicle_group_change(uuid,integer,uuid,uuid,text,uuid),public.operations_apply_vehicle_group_change(uuid),public.operations_retry_vehicle_group_change_notification(uuid),public.get_operations_vehicle_group_changes(uuid),public.get_operations_departure_calendar(date,date),public.get_operations_system_release_info() from public,anon;
grant execute on function public.operations_request_vehicle_group_change(uuid,integer,uuid,uuid,text,uuid),public.operations_apply_vehicle_group_change(uuid),public.operations_retry_vehicle_group_change_notification(uuid),public.get_operations_vehicle_group_changes(uuid),public.get_operations_departure_calendar(date,date),public.get_operations_system_release_info() to authenticated,service_role;

commit;
