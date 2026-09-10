begin;

create or replace function public.start_driver_location_session_v2(p_vehicle_group uuid,p_minutes integer default 30)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_expires timestamptz;
begin
  if auth.uid() is null or p_minutes not between 15 and 30 or not public.is_group_staff(p_vehicle_group) then raise exception 'active assigned staff only'; end if;
  if not exists(select 1 from public.trip_rooms r where r.vehicle_group_id=p_vehicle_group and r.status='open') or exists(select 1 from public.vehicle_group_journey_state j where j.vehicle_group_id=p_vehicle_group and j.status='completed') then raise exception 'journey is not shareable'; end if;
  update public.driver_location_session_tokens set stopped_at=coalesce(stopped_at,now()) where vehicle_group_id=p_vehicle_group and staff_id=auth.uid() and stopped_at is null;
  v_expires:=now()+make_interval(mins=>p_minutes);
  insert into public.driver_location_session_tokens(vehicle_group_id,staff_id,expires_at) values(p_vehicle_group,auth.uid(),v_expires) returning id into v_id;
  return jsonb_build_object('sessionId',v_id,'expiresAt',v_expires);
end$$;

revoke all on function public.start_driver_location_session_v2(uuid,integer),public.publish_driver_location(uuid,numeric,numeric,numeric,integer) from public,anon,authenticated;
grant execute on function public.start_driver_location_session_v2(uuid,integer) to authenticated,service_role;
grant execute on function public.publish_driver_location(uuid,numeric,numeric,numeric,integer) to service_role;

commit;
