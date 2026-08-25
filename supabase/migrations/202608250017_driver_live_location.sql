begin;

create table public.driver_location_sessions(
  id uuid primary key default gen_random_uuid(),
  vehicle_group_id uuid not null references public.vehicle_groups(id) on delete cascade,
  staff_id uuid not null references public.profiles(id),
  latitude numeric(9,6) not null check(latitude between -90 and 90),
  longitude numeric(9,6) not null check(longitude between -180 and 180),
  accuracy_meters numeric(8,2) check(accuracy_meters is null or accuracy_meters between 0 and 1000),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  stopped_at timestamptz,
  unique(vehicle_group_id,staff_id),
  check(expires_at>started_at)
);
alter table public.driver_location_sessions enable row level security;
revoke all on public.driver_location_sessions from public,anon,authenticated;
grant all on public.driver_location_sessions to service_role;

create or replace function public.publish_driver_location(p_vehicle_group uuid,p_latitude numeric,p_longitude numeric,p_accuracy_meters numeric,p_minutes integer default 15)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare session_id uuid;
begin
  if auth.uid() is null or p_minutes not between 5 and 30 or p_latitude not between -90 and 90 or p_longitude not between -180 and 180
    or (p_accuracy_meters is not null and p_accuracy_meters not between 0 and 1000) then raise exception 'invalid driver location'; end if;
  if not exists(select 1 from public.staff_assignments sa where sa.vehicle_group_id=p_vehicle_group and sa.staff_id=auth.uid() and sa.role in ('driver','guide'))
    or not exists(select 1 from public.trip_rooms r where r.vehicle_group_id=p_vehicle_group and r.status='open')
  then raise exception 'assigned open-room staff only'; end if;
  insert into public.driver_location_sessions as d(vehicle_group_id,staff_id,latitude,longitude,accuracy_meters,started_at,updated_at,expires_at,stopped_at)
    values(p_vehicle_group,auth.uid(),p_latitude,p_longitude,p_accuracy_meters,now(),now(),now()+make_interval(mins=>p_minutes),null)
    on conflict(vehicle_group_id,staff_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,accuracy_meters=excluded.accuracy_meters,
      started_at=case when d.stopped_at is not null or d.expires_at<=now() then now() else d.started_at end,updated_at=now(),expires_at=excluded.expires_at,stopped_at=null
    returning id into session_id;
  return session_id;
end$$;

create or replace function public.stop_driver_location(p_vehicle_group uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare stopped integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  update public.driver_location_sessions set stopped_at=now(),updated_at=now()
    where vehicle_group_id=p_vehicle_group and staff_id=auth.uid() and stopped_at is null;
  get diagnostics stopped=row_count;return stopped;
end$$;

create or replace function public.get_active_driver_location(p_vehicle_group uuid)
returns table(latitude numeric,longitude numeric,accuracy_meters numeric,updated_at timestamptz,expires_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select d.latitude,d.longitude,d.accuracy_meters,d.updated_at,d.expires_at
  from public.driver_location_sessions d join public.trip_rooms r on r.vehicle_group_id=d.vehicle_group_id
  where d.vehicle_group_id=p_vehicle_group and d.stopped_at is null and d.expires_at>now() and r.status='open'
    and public.can_receive_vehicle_group(p_vehicle_group)
  order by d.updated_at desc limit 1;
$$;

revoke all on function public.publish_driver_location(uuid,numeric,numeric,numeric,integer),public.stop_driver_location(uuid),public.get_active_driver_location(uuid) from public,anon;
grant execute on function public.publish_driver_location(uuid,numeric,numeric,numeric,integer),public.stop_driver_location(uuid),public.get_active_driver_location(uuid) to authenticated,service_role;

commit;
