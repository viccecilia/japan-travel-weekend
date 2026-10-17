-- Keep one explicit passenger location-share session alive while the page is
-- active. Coordinate refreshes update that session instead of creating a new
-- row every few seconds. A new 15-minute session is created only after the
-- previous consent window expires.
create or replace function public.publish_own_location_share(
  p_vehicle_group uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy numeric,
  p_sampled_at timestamptz,
  p_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_share_id uuid;
begin
  if v_user is null
    or p_confirmed is distinct from true
    or p_latitude is null
    or p_longitude is null
    or p_sampled_at is null
    or p_latitude not between -90 and 90
    or p_longitude not between -180 and 180
    or (p_accuracy is not null and p_accuracy not between 0 and 10000)
    or p_sampled_at < now() - interval '2 minutes'
    or p_sampled_at > now() + interval '30 seconds'
  then
    raise exception 'explicit consent and fresh coordinates required';
  end if;

  if not public.is_vehicle_group_member(p_vehicle_group)
    or not public.is_vehicle_group_executable(p_vehicle_group)
    or not exists (
      select 1
      from public.trip_rooms r
      where r.vehicle_group_id = p_vehicle_group
        and r.status = 'open'
    )
    or exists (
      select 1
      from public.vehicle_group_journey_state j
      where j.vehicle_group_id = p_vehicle_group
        and j.status = 'completed'
    )
  then
    raise exception 'journey is not shareable';
  end if;

  -- Serialize updates from multiple tabs for the same passenger.
  perform 1 from public.profiles p where p.id = v_user for update;

  select s.id
    into v_share_id
  from public.location_shares s
  where s.vehicle_group_id = p_vehicle_group
    and s.subject_id = v_user
    and s.stopped_at is null
    and s.expires_at > now()
  order by s.started_at desc
  limit 1
  for update;

  if v_share_id is null then
    update public.location_shares s
      set stopped_at = coalesce(s.stopped_at, now())
    where s.vehicle_group_id = p_vehicle_group
      and s.subject_id = v_user
      and s.stopped_at is null;

    insert into public.location_shares(
      vehicle_group_id,
      subject_id,
      scope,
      started_at,
      expires_at
    ) values (
      p_vehicle_group,
      v_user,
      'assigned_staff_only',
      now(),
      now() + interval '15 minutes'
    )
    returning id into v_share_id;
  end if;

  update public.location_shares
    set latitude = p_latitude,
        longitude = p_longitude,
        accuracy_meters = p_accuracy,
        sampled_at = p_sampled_at
  where id = v_share_id;

  return v_share_id;
end
$$;

revoke all on function public.publish_own_location_share(uuid,numeric,numeric,numeric,timestamptz,boolean) from public, anon;
grant execute on function public.publish_own_location_share(uuid,numeric,numeric,numeric,timestamptz,boolean) to authenticated;
