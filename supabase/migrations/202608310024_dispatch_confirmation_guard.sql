begin;

create or replace function public.guard_dispatch_task_confirmation()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare departure_time timestamptz; starts_value timestamptz; ends_value timestamptz; active_statuses public.dispatch_task_status[]:=array['confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress']::public.dispatch_task_status[];
begin
  if new.status='cancelled' then return new; end if;
  starts_value:=(new.payload->>'startsAt')::timestamptz;
  ends_value:=(new.payload->>'endsAt')::timestamptz;
  select d.departs_at into departure_time from public.vehicle_assignments va join public.departures d on d.id=va.departure_id where va.id=new.vehicle_assignment_id;
  if departure_time is null or starts_value is null or ends_value is null or ends_value<=starts_value or starts_value<departure_time-interval '6 hours' or starts_value>departure_time+interval '6 hours' or ends_value>departure_time+interval '36 hours' then raise exception 'dispatch time outside departure window'; end if;
  if new.status=any(active_statuses) then
    perform 1 from public.driver_resources where id=new.driver_id for update;
    if tg_op='INSERT' then
      perform 1 from public.fleet_vehicles where id=new.fleet_vehicle_id and status='available' for update;
      if not found then raise exception 'fleet vehicle is not available'; end if;
    elsif old.status<>all(active_statuses) then
      perform 1 from public.fleet_vehicles where id=new.fleet_vehicle_id and status='available' for update;
      if not found then raise exception 'fleet vehicle is not available'; end if;
    else
      perform 1 from public.fleet_vehicles where id=new.fleet_vehicle_id for update;
    end if;
    if exists(select 1 from public.dispatch_tasks t where t.id<>new.id and t.status=any(active_statuses) and (t.driver_id=new.driver_id or t.fleet_vehicle_id=new.fleet_vehicle_id) and (t.payload->>'startsAt')::timestamptz<ends_value and (t.payload->>'endsAt')::timestamptz>starts_value) then raise exception 'dispatch resource time conflict'; end if;
  end if;
  return new;
end$$;

drop trigger if exists guard_dispatch_task_confirmation on public.dispatch_tasks;
create trigger guard_dispatch_task_confirmation before insert or update of status,vehicle_assignment_id,driver_id,fleet_vehicle_id,payload on public.dispatch_tasks for each row execute function public.guard_dispatch_task_confirmation();

revoke all on function public.guard_dispatch_task_confirmation() from public,anon,authenticated;

commit;
