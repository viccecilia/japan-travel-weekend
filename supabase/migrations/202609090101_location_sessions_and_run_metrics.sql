begin;

alter table public.driver_location_points add column if not exists session_id uuid;
update public.driver_location_points set session_id=gen_random_uuid() where session_id is null;
alter table public.driver_location_points alter column session_id set not null;
alter table public.driver_location_points drop constraint if exists driver_location_points_vehicle_group_id_staff_id_sequence_key;
create unique index if not exists driver_location_points_session_sequence_unique
  on public.driver_location_points(vehicle_group_id,staff_id,session_id,sequence);
alter table public.driver_location_sessions add column if not exists sampled_at timestamptz;
alter table public.driver_location_sessions add column if not exists received_at timestamptz;

drop function if exists public.append_driver_location_point(uuid,numeric,numeric,numeric,timestamptz,integer);
create function public.append_driver_location_point(p_vehicle_group uuid,p_session uuid,p_latitude numeric,p_longitude numeric,p_accuracy_meters numeric,p_sampled_at timestamptz,p_sequence integer)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id bigint;v_previous public.driver_location_points%rowtype;v_existing public.driver_location_points%rowtype;
begin
  if auth.uid() is null or p_session is null or not public.is_group_staff(p_vehicle_group) then raise exception 'active assigned staff only'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 or p_sequence<1 or (p_accuracy_meters is not null and p_accuracy_meters not between 0 and 1000) then raise exception 'invalid location'; end if;
  if p_sampled_at>now()+interval '2 minutes' or p_sampled_at<now()-interval '30 minutes' then raise exception 'stale location'; end if;
  if not exists(select 1 from public.trip_rooms where vehicle_group_id=p_vehicle_group and status='open')
    or exists(select 1 from public.vehicle_group_journey_state where vehicle_group_id=p_vehicle_group and status='completed') then raise exception 'journey is not shareable'; end if;
  select * into v_existing from public.driver_location_points where vehicle_group_id=p_vehicle_group and staff_id=auth.uid() and session_id=p_session and sequence=p_sequence;
  if found then
    if v_existing.latitude<>p_latitude or v_existing.longitude<>p_longitude or v_existing.recorded_at<>p_sampled_at then raise exception 'location idempotency conflict'; end if;
    return v_existing.id;
  end if;
  select * into v_previous from public.driver_location_points where vehicle_group_id=p_vehicle_group and staff_id=auth.uid() and session_id=p_session order by sequence desc limit 1;
  if v_previous.id is not null and (p_sequence<=v_previous.sequence or p_sampled_at<v_previous.recorded_at) then raise exception 'out of order location'; end if;
  insert into public.driver_location_points(vehicle_group_id,staff_id,session_id,sequence,latitude,longitude,accuracy_meters,recorded_at,suspicious)
  values(p_vehicle_group,auth.uid(),p_session,p_sequence,p_latitude,p_longitude,p_accuracy_meters,p_sampled_at,p_accuracy_meters is not null and p_accuracy_meters>250)
  returning id into v_id;
  insert into public.driver_location_sessions as s(vehicle_group_id,staff_id,latitude,longitude,accuracy_meters,started_at,updated_at,expires_at,stopped_at,sampled_at,received_at)
  values(p_vehicle_group,auth.uid(),p_latitude,p_longitude,p_accuracy_meters,now(),now(),now()+interval '15 minutes',null,p_sampled_at,now())
  on conflict(vehicle_group_id,staff_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,accuracy_meters=excluded.accuracy_meters,updated_at=now(),expires_at=now()+interval '15 minutes',stopped_at=null,sampled_at=excluded.sampled_at,received_at=now();
  return v_id;
end$$;

-- The legacy current-location entry point remains for compatible clients but
-- receives the same active-assignment and completed-journey gate.
create or replace function public.publish_driver_location(p_vehicle_group uuid,p_latitude numeric,p_longitude numeric,p_accuracy_meters numeric,p_minutes integer default 15)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$declare location_session_id uuid;begin
  if auth.uid() is null or not public.is_group_staff(p_vehicle_group) or p_minutes not between 5 and 30 or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 or (p_accuracy_meters is not null and p_accuracy_meters not between 0 and 1000) then raise exception 'invalid or unauthorized driver location';end if;
  if not exists(select 1 from public.trip_rooms where vehicle_group_id=p_vehicle_group and status='open') or exists(select 1 from public.vehicle_group_journey_state where vehicle_group_id=p_vehicle_group and status='completed') then raise exception 'journey is not shareable';end if;
  insert into public.driver_location_sessions as d(vehicle_group_id,staff_id,latitude,longitude,accuracy_meters,started_at,updated_at,expires_at,stopped_at,sampled_at,received_at) values(p_vehicle_group,auth.uid(),p_latitude,p_longitude,p_accuracy_meters,now(),now(),now()+make_interval(mins=>p_minutes),null,now(),now())
  on conflict(vehicle_group_id,staff_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,accuracy_meters=excluded.accuracy_meters,started_at=case when d.stopped_at is not null or d.expires_at<=now() then now() else d.started_at end,updated_at=now(),expires_at=excluded.expires_at,stopped_at=null,sampled_at=excluded.sampled_at,received_at=excluded.received_at returning id into location_session_id;return location_session_id;end$$;

create or replace function public.get_operations_driver_transport_statistics(p_from date,p_to date)
returns table(driver_id uuid,driver_name text,service_role text,assigned_runs bigint,completed_runs bigint,sold_passengers bigint,assigned_passengers bigint,boarded_passengers bigint,completed_passengers bigint,available_seats bigint,load_factor numeric,last_location_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  with active_tasks as (
    select distinct on (va.id) dt.*,va.capacity,vg.id vehicle_group_id,d.id departure_id,d.departs_at,js.status journey_status
    from public.vehicle_assignments va join public.vehicle_groups vg on vg.vehicle_assignment_id=va.id join public.departures d on d.id=vg.departure_id
    join public.dispatch_tasks dt on dt.vehicle_assignment_id=va.id
    left join public.vehicle_group_journey_state js on js.vehicle_group_id=vg.id
    where (d.departs_at at time zone 'Asia/Tokyo')::date between p_from and p_to and dt.status not in ('draft','rejected','cancelled','failed')
    order by va.id,case when dt.status='completed' then 0 else 1 end,dt.updated_at desc
  ), metrics as (
    select a.*,coalesce(s.sold,0) sold,coalesce(s.assigned,0) assigned,coalesce(b.boarded,0) boarded
    from active_tasks a
    left join lateral(select count(distinct p.id) filter(where o.status in ('paid','confirmed')) sold,count(distinct p.id) filter(where o.status in ('paid','confirmed')) assigned from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id join public.passengers p on p.order_id=o.id where vgo.vehicle_group_id=a.vehicle_group_id) s on true
    left join lateral(select count(distinct pc.passenger_id)::bigint boarded from public.passenger_checkins pc join public.orders o on o.id=pc.order_id where pc.vehicle_group_id=a.vehicle_group_id and pc.status='boarded' and o.status in ('paid','confirmed')) b on true
  )
  select dr.id,dr.display_name,dr.service_role::text,count(distinct m.id),count(distinct m.id) filter(where m.journey_status='completed'),coalesce(sum(m.sold),0),coalesce(sum(m.assigned),0),coalesce(sum(m.boarded),0),coalesce(sum(m.boarded) filter(where m.journey_status='completed'),0),coalesce(sum(m.capacity),0),case when coalesce(sum(m.capacity),0)>0 then round(100.0*sum(m.boarded)/sum(m.capacity),1) else 0 end,max(lp.recorded_at)
  from public.driver_resources dr left join metrics m on m.driver_id=dr.id
  left join lateral(select max(p.recorded_at) recorded_at from public.driver_location_points p where p.vehicle_group_id=m.vehicle_group_id and p.staff_id=dr.account_id) lp on true
  where public.is_operations() group by dr.id,dr.display_name,dr.service_role order by 5 desc,4 desc,dr.display_name
$$;

revoke all on function public.append_driver_location_point(uuid,uuid,numeric,numeric,numeric,timestamptz,integer),public.publish_driver_location(uuid,numeric,numeric,numeric,integer),public.get_operations_driver_transport_statistics(date,date) from public,anon;
grant execute on function public.append_driver_location_point(uuid,uuid,numeric,numeric,numeric,timestamptz,integer),public.publish_driver_location(uuid,numeric,numeric,numeric,integer) to authenticated,service_role;
grant execute on function public.get_operations_driver_transport_statistics(date,date) to authenticated,service_role;

commit;
