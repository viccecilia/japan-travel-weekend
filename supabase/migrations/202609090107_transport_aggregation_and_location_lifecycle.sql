begin;

create table if not exists public.driver_location_session_tokens(
  id uuid primary key default gen_random_uuid(),
  vehicle_group_id uuid not null references public.vehicle_groups(id) on delete cascade,
  staff_id uuid not null references public.profiles(id),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  stopped_at timestamptz,
  check(expires_at>started_at)
);
create unique index if not exists driver_location_one_active_token on public.driver_location_session_tokens(vehicle_group_id,staff_id) where stopped_at is null;
alter table public.driver_location_session_tokens enable row level security;
revoke all on public.driver_location_session_tokens from public,anon,authenticated;
grant all on public.driver_location_session_tokens to service_role;

create or replace function public.start_driver_location_session(p_vehicle_group uuid,p_minutes integer default 15)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  if auth.uid() is null or p_minutes not between 5 and 30 or not public.is_group_staff(p_vehicle_group) then raise exception 'active assigned staff only'; end if;
  if not exists(select 1 from public.trip_rooms r where r.vehicle_group_id=p_vehicle_group and r.status='open')
    or exists(select 1 from public.vehicle_group_journey_state j where j.vehicle_group_id=p_vehicle_group and j.status='completed') then raise exception 'journey is not shareable'; end if;
  update public.driver_location_session_tokens t set stopped_at=coalesce(t.stopped_at,now()) where t.vehicle_group_id=p_vehicle_group and t.staff_id=auth.uid() and t.stopped_at is null;
  insert into public.driver_location_session_tokens(vehicle_group_id,staff_id,expires_at) values(p_vehicle_group,auth.uid(),now()+make_interval(mins=>p_minutes)) returning id into v_id;
  return v_id;
end$$;

create or replace function public.append_driver_location_point(p_vehicle_group uuid,p_session uuid,p_latitude numeric,p_longitude numeric,p_accuracy_meters numeric,p_sampled_at timestamptz,p_sequence integer)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id bigint;v_token public.driver_location_session_tokens%rowtype;v_previous public.driver_location_points%rowtype;v_existing public.driver_location_points%rowtype;v_current public.driver_location_sessions%rowtype;
begin
  if auth.uid() is null or p_session is null or not public.is_group_staff(p_vehicle_group) then raise exception 'active assigned staff only'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 or p_sequence<1 or (p_accuracy_meters is not null and p_accuracy_meters not between 0 and 1000) then raise exception 'invalid location'; end if;
  if p_sampled_at>now()+interval '2 minutes' or p_sampled_at<now()-interval '30 minutes' then raise exception 'stale location'; end if;
  select t.* into v_token from public.driver_location_session_tokens t where t.id=p_session and t.vehicle_group_id=p_vehicle_group and t.staff_id=auth.uid() for update;
  if v_token.id is null or v_token.stopped_at is not null or v_token.expires_at<=now() then raise exception 'location session inactive'; end if;
  if not exists(select 1 from public.trip_rooms r where r.vehicle_group_id=p_vehicle_group and r.status='open')
    or exists(select 1 from public.vehicle_group_journey_state j where j.vehicle_group_id=p_vehicle_group and j.status='completed') then raise exception 'journey is not shareable'; end if;
  select p.* into v_existing from public.driver_location_points p where p.vehicle_group_id=p_vehicle_group and p.staff_id=auth.uid() and p.session_id=p_session and p.sequence=p_sequence;
  if found then
    if v_existing.latitude<>p_latitude or v_existing.longitude<>p_longitude or v_existing.recorded_at<>p_sampled_at then raise exception 'location idempotency conflict'; end if;
    return v_existing.id;
  end if;
  select p.* into v_previous from public.driver_location_points p where p.vehicle_group_id=p_vehicle_group and p.staff_id=auth.uid() and p.session_id=p_session order by p.sequence desc limit 1;
  if v_previous.id is not null and (p_sequence<=v_previous.sequence or p_sampled_at<v_previous.recorded_at) then raise exception 'out of order location'; end if;
  select s.* into v_current from public.driver_location_sessions s where s.vehicle_group_id=p_vehicle_group and s.staff_id=auth.uid() for update;
  if v_current.id is not null and v_current.sampled_at is not null and p_sampled_at<v_current.sampled_at then raise exception 'cross-session location rollback'; end if;
  insert into public.driver_location_points(vehicle_group_id,staff_id,session_id,sequence,latitude,longitude,accuracy_meters,recorded_at,suspicious)
  values(p_vehicle_group,auth.uid(),p_session,p_sequence,p_latitude,p_longitude,p_accuracy_meters,p_sampled_at,p_accuracy_meters is not null and p_accuracy_meters>250) returning id into v_id;
  insert into public.driver_location_sessions as s(vehicle_group_id,staff_id,latitude,longitude,accuracy_meters,started_at,updated_at,expires_at,stopped_at,sampled_at,received_at)
  values(p_vehicle_group,auth.uid(),p_latitude,p_longitude,p_accuracy_meters,v_token.started_at,now(),v_token.expires_at,null,p_sampled_at,now())
  on conflict(vehicle_group_id,staff_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,accuracy_meters=excluded.accuracy_meters,started_at=excluded.started_at,updated_at=now(),expires_at=excluded.expires_at,stopped_at=null,sampled_at=excluded.sampled_at,received_at=now();
  return v_id;
end$$;

create or replace function public.stop_driver_location(p_vehicle_group uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  update public.driver_location_session_tokens t set stopped_at=coalesce(t.stopped_at,now()) where t.vehicle_group_id=p_vehicle_group and t.staff_id=auth.uid() and t.stopped_at is null;
  get diagnostics v_count=row_count;
  update public.driver_location_sessions s set stopped_at=coalesce(s.stopped_at,now()),updated_at=now() where s.vehicle_group_id=p_vehicle_group and s.staff_id=auth.uid() and s.stopped_at is null;
  return v_count;
end$$;

drop function if exists public.get_operations_driver_transport_statistics(date,date);
create function public.get_operations_driver_transport_statistics(p_from date,p_to date)
returns table(driver_id uuid,driver_name text,service_role text,assigned_runs bigint,completed_runs bigint,sold_passengers bigint,assigned_passengers bigint,boarded_passengers bigint,completed_passengers bigint,available_seats bigint,load_factor numeric,open_incidents bigint,last_location_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  with current_tasks as (
    select distinct on (va.id) dt.id,dt.driver_id,va.capacity,vg.id vehicle_group_id,d.id departure_id,js.status journey_status
    from public.vehicle_assignments va join public.vehicle_groups vg on vg.vehicle_assignment_id=va.id join public.departures d on d.id=vg.departure_id
    join public.dispatch_tasks dt on dt.vehicle_assignment_id=va.id left join public.vehicle_group_journey_state js on js.vehicle_group_id=vg.id
    where (d.departs_at at time zone 'Asia/Tokyo')::date between p_from and p_to and dt.status not in ('draft','rejected','cancelled','failed')
    order by va.id,case when dt.status='completed' then 0 else 1 end,dt.updated_at desc
  ),metrics as (
    select a.*,coalesce(s.sold,0) sold,coalesce(g.assigned,0) assigned,coalesce(b.boarded,0) boarded,coalesce(i.open_count,0) open_count,l.recorded_at
    from current_tasks a
    left join lateral(select count(distinct p.id)::bigint sold from public.orders o join public.passengers p on p.order_id=o.id where o.departure_id=a.departure_id and o.status in ('paid','confirmed')) s on true
    left join lateral(select count(distinct p.id)::bigint assigned from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id join public.passengers p on p.order_id=o.id where vgo.vehicle_group_id=a.vehicle_group_id and o.status in ('paid','confirmed')) g on true
    left join lateral(select count(distinct pc.passenger_id)::bigint boarded from public.passenger_checkins pc join public.passenger_checkin_events e on e.checkin_id=pc.id and e.status='boarded' join public.orders o on o.id=pc.order_id where pc.vehicle_group_id=a.vehicle_group_id and o.status in ('paid','confirmed')) b on true
    left join lateral(select count(*)::bigint open_count from public.operational_incidents oi where oi.vehicle_group_id=a.vehicle_group_id and oi.resolved_at is null) i on true
    left join lateral(select max(p.recorded_at) recorded_at from public.driver_location_points p join public.driver_resources drx on drx.account_id=p.staff_id where p.vehicle_group_id=a.vehicle_group_id and drx.id=a.driver_id) l on true
  )
  select dr.id,dr.display_name,dr.service_role::text,count(m.id),count(m.id) filter(where m.journey_status='completed'),coalesce(sum(m.sold),0),coalesce(sum(m.assigned),0),coalesce(sum(m.boarded),0),coalesce(sum(m.boarded) filter(where m.journey_status='completed'),0),coalesce(sum(m.capacity),0),case when coalesce(sum(m.capacity),0)>0 then round(100.0*sum(m.boarded)/sum(m.capacity),1) else 0 end,coalesce(sum(m.open_count),0),max(m.recorded_at)
  from public.driver_resources dr left join metrics m on m.driver_id=dr.id
  where public.is_operations() group by dr.id,dr.display_name,dr.service_role order by 5 desc,4 desc,dr.display_name
$$;

revoke all on function public.start_driver_location_session(uuid,integer),public.append_driver_location_point(uuid,uuid,numeric,numeric,numeric,timestamptz,integer),public.stop_driver_location(uuid),public.get_operations_driver_transport_statistics(date,date) from public,anon;
grant execute on function public.start_driver_location_session(uuid,integer),public.append_driver_location_point(uuid,uuid,numeric,numeric,numeric,timestamptz,integer),public.stop_driver_location(uuid),public.get_operations_driver_transport_statistics(date,date) to authenticated,service_role;

commit;
