begin;

create table public.driver_location_points(
  id bigint generated always as identity primary key,
  vehicle_group_id uuid not null references public.vehicle_groups(id) on delete cascade,
  staff_id uuid not null references public.profiles(id),
  sequence integer not null check(sequence>0),
  latitude numeric(9,6) not null check(latitude between -90 and 90),
  longitude numeric(9,6) not null check(longitude between -180 and 180),
  accuracy_meters numeric(8,2) check(accuracy_meters is null or accuracy_meters between 0 and 1000),
  recorded_at timestamptz not null,
  received_at timestamptz not null default now(),
  suspicious boolean not null default false,
  unique(vehicle_group_id,staff_id,sequence)
);
create index driver_location_points_recent on public.driver_location_points(vehicle_group_id,recorded_at desc);
alter table public.driver_location_points enable row level security;
revoke all on public.driver_location_points from public,anon,authenticated;
grant all on public.driver_location_points to service_role;

create or replace function public.append_driver_location_point(p_vehicle_group uuid,p_latitude numeric,p_longitude numeric,p_accuracy_meters numeric,p_recorded_at timestamptz,p_sequence integer)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id bigint;v_previous public.driver_location_points%rowtype;
begin
  if auth.uid() is null or not public.is_group_staff(p_vehicle_group) then raise exception 'active assigned staff only'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 or p_sequence<1 or (p_accuracy_meters is not null and p_accuracy_meters not between 0 and 1000) then raise exception 'invalid location'; end if;
  if p_recorded_at>now()+interval '2 minutes' or p_recorded_at<now()-interval '30 minutes' then raise exception 'stale location'; end if;
  if not exists(select 1 from public.trip_rooms where vehicle_group_id=p_vehicle_group and status='open') or exists(select 1 from public.vehicle_group_journey_state where vehicle_group_id=p_vehicle_group and status='completed') then raise exception 'journey is not shareable'; end if;
  select * into v_previous from public.driver_location_points where vehicle_group_id=p_vehicle_group and staff_id=auth.uid() order by recorded_at desc limit 1;
  if v_previous.id is not null and p_recorded_at<v_previous.recorded_at then raise exception 'out of order location'; end if;
  insert into public.driver_location_points(vehicle_group_id,staff_id,sequence,latitude,longitude,accuracy_meters,recorded_at,suspicious)
  values(p_vehicle_group,auth.uid(),p_sequence,p_latitude,p_longitude,p_accuracy_meters,p_recorded_at,p_accuracy_meters is not null and p_accuracy_meters>250)
  on conflict(vehicle_group_id,staff_id,sequence) do update set received_at=public.driver_location_points.received_at returning id into v_id;
  perform public.publish_driver_location(p_vehicle_group,p_latitude,p_longitude,p_accuracy_meters,15);
  return v_id;
end$$;

create or replace function public.get_driver_location_history(p_vehicle_group uuid,p_since timestamptz default now()-interval '12 hours')
returns table(latitude numeric,longitude numeric,accuracy_meters numeric,recorded_at timestamptz,received_at timestamptz,suspicious boolean,is_stale boolean)
language sql stable security definer set search_path=public,pg_temp as $$
  select p.latitude,p.longitude,p.accuracy_meters,p.recorded_at,p.received_at,p.suspicious,p.recorded_at<now()-interval '3 minutes'
  from public.driver_location_points p
  where p.vehicle_group_id=p_vehicle_group and p.recorded_at>=p_since and (public.is_operations() or public.is_group_staff(p_vehicle_group) or public.can_receive_vehicle_group(p_vehicle_group))
  order by p.recorded_at;
$$;

revoke all on function public.append_driver_location_point(uuid,numeric,numeric,numeric,timestamptz,integer),public.get_driver_location_history(uuid,timestamptz) from public,anon;
grant execute on function public.append_driver_location_point(uuid,numeric,numeric,numeric,timestamptz,integer),public.get_driver_location_history(uuid,timestamptz) to authenticated,service_role;

commit;
