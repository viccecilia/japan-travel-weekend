alter table public.location_shares
  add column latitude numeric(9,6) check(latitude between -90 and 90),
  add column longitude numeric(9,6) check(longitude between -180 and 180),
  add column accuracy_meters numeric check(accuracy_meters between 0 and 10000),
  add column sampled_at timestamptz;

-- No coordinates are placed in chat text or its broadcasts. Expired/revoked
-- shares stop being readable even before the existing retention job runs.
drop policy if exists locations_subject_or_staff_ops on public.location_shares;
create policy locations_subject_or_staff_ops on public.location_shares for select to authenticated
using (
  (subject_id=auth.uid() or public.is_group_staff(vehicle_group_id))
  and stopped_at is null and expires_at>now()
  and public.is_vehicle_group_executable(vehicle_group_id)
  and exists(select 1 from public.trip_rooms r where r.vehicle_group_id=location_shares.vehicle_group_id and r.status='open')
  and not exists(select 1 from public.vehicle_group_journey_state j where j.vehicle_group_id=location_shares.vehicle_group_id and j.status='completed')
);

create or replace function public.start_own_location_share(p_vehicle_group uuid,p_minutes integer)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare share_id uuid;
begin
  if auth.uid() is null or p_minutes is null or p_minutes not in (15,30)
    or not public.is_vehicle_group_member(p_vehicle_group) then raise exception 'not an eligible vehicle group passenger'; end if;
  if not public.is_vehicle_group_executable(p_vehicle_group)
    or not exists(select 1 from public.trip_rooms where vehicle_group_id=p_vehicle_group and status='open')
    or exists(select 1 from public.vehicle_group_journey_state where vehicle_group_id=p_vehicle_group and status='completed') then
    raise exception 'journey is not shareable';
  end if;
  perform 1 from public.profiles where id=auth.uid() for update;
  update public.location_shares set stopped_at=now() where vehicle_group_id=p_vehicle_group and subject_id=auth.uid() and stopped_at is null;
  insert into public.location_shares(vehicle_group_id,subject_id,scope,started_at,expires_at)
  values(p_vehicle_group,auth.uid(),'assigned_staff_only',now(),now()+make_interval(mins=>p_minutes)) returning id into share_id;
  return share_id;
end$$;

create function public.publish_own_location_share(p_vehicle_group uuid,p_latitude numeric,p_longitude numeric,p_accuracy numeric,p_sampled_at timestamptz,p_confirmed boolean)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare share_id uuid;
begin
  if p_confirmed is distinct from true or p_latitude is null or p_longitude is null or p_sampled_at is null
    or p_latitude not between -90 and 90 or p_longitude not between -180 and 180
    or (p_accuracy is not null and p_accuracy not between 0 and 10000)
    or p_sampled_at<now()-interval '2 minutes' or p_sampled_at>now()+interval '30 seconds' then
    raise exception 'explicit consent and fresh coordinates required';
  end if;
  share_id:=public.start_own_location_share(p_vehicle_group,15);
  update public.location_shares set latitude=p_latitude,longitude=p_longitude,accuracy_meters=p_accuracy,sampled_at=p_sampled_at where id=share_id;
  return share_id;
end$$;

create function public.get_passenger_location_shares(p_vehicle_group uuid)
returns table(id uuid,subject_id uuid,display_name text,latitude numeric,longitude numeric,accuracy_meters numeric,sampled_at timestamptz,expires_at timestamptz)
language sql stable security invoker set search_path=public,pg_temp as $$
  select s.id,s.subject_id,p.display_name,s.latitude,s.longitude,s.accuracy_meters,s.sampled_at,s.expires_at
  from public.location_shares s left join public.profiles p on p.id=s.subject_id
  where s.vehicle_group_id=p_vehicle_group and s.latitude is not null and s.longitude is not null
  order by s.sampled_at desc
$$;
revoke all on function public.start_own_location_share(uuid,integer),public.publish_own_location_share(uuid,numeric,numeric,numeric,timestamptz,boolean),public.get_passenger_location_shares(uuid) from public,anon;
grant execute on function public.start_own_location_share(uuid,integer),public.publish_own_location_share(uuid,numeric,numeric,numeric,timestamptz,boolean),public.get_passenger_location_shares(uuid) to authenticated;
