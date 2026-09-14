begin;

create or replace function public.update_vehicle_group_meeting(
  p_vehicle_group uuid,p_meeting_at timestamptz,p_meeting_name text,p_meeting_address text,
  p_latitude numeric,p_longitude numeric,p_landmark_description text,p_reason text,p_idempotency_key text
) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_previous public.vehicle_group_meeting_state%rowtype;v_revision integer;v_room uuid;v_content text;
begin
  if auth.uid() is null or not(public.is_operations() or public.is_group_staff(p_vehicle_group)) then raise exception 'assigned staff only'; end if;
  if p_meeting_at is null or length(trim(p_meeting_name)) not between 2 and 160 or length(trim(p_meeting_address)) not between 3 and 300
    or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 or length(trim(p_reason)) not between 3 and 300
    or length(trim(p_idempotency_key))<8 then raise exception 'invalid meeting update'; end if;
  if exists(select 1 from public.staff_execution_events where actor_id=auth.uid() and idempotency_key=p_idempotency_key) then
    select revision into v_revision from public.vehicle_group_meeting_state where vehicle_group_id=p_vehicle_group; return v_revision;
  end if;
  select * into v_previous from public.vehicle_group_meeting_state where vehicle_group_id=p_vehicle_group for update;

  if v_previous.vehicle_group_id is not null
    and v_previous.meeting_at is not distinct from p_meeting_at
    and v_previous.meeting_name is not distinct from trim(p_meeting_name)
    and v_previous.meeting_address is not distinct from trim(p_meeting_address)
    and v_previous.latitude is not distinct from p_latitude
    and v_previous.longitude is not distinct from p_longitude
    and v_previous.landmark_description is not distinct from trim(coalesce(p_landmark_description,'')) then
    return v_previous.revision;
  end if;

  v_revision:=coalesce(v_previous.revision,0)+1;
  insert into public.vehicle_group_meeting_state(vehicle_group_id,meeting_at,meeting_name,meeting_address,latitude,longitude,landmark_description,status,revision,changed_reason,changed_by,changed_at,updated_at)
  values(p_vehicle_group,p_meeting_at,trim(p_meeting_name),trim(p_meeting_address),p_latitude,p_longitude,trim(coalesce(p_landmark_description,'')),'scheduled',v_revision,trim(p_reason),auth.uid(),now(),now())
  on conflict(vehicle_group_id) do update set meeting_at=excluded.meeting_at,meeting_name=excluded.meeting_name,meeting_address=excluded.meeting_address,latitude=excluded.latitude,longitude=excluded.longitude,landmark_description=excluded.landmark_description,status='scheduled',revision=excluded.revision,changed_reason=excluded.changed_reason,changed_by=excluded.changed_by,changed_at=excluded.changed_at,updated_at=excluded.updated_at;
  insert into public.staff_execution_events(vehicle_group_id,actor_id,event_type,detail,idempotency_key)
  values(p_vehicle_group,auth.uid(),'meeting_updated',jsonb_build_object('revision',v_revision,'oldTime',v_previous.meeting_at,'newTime',p_meeting_at,'oldName',v_previous.meeting_name,'newName',trim(p_meeting_name),'reason',trim(p_reason)),p_idempotency_key);
  select id into v_room from public.trip_rooms where vehicle_group_id=p_vehicle_group and status='open';
  if v_room is not null and v_previous.vehicle_group_id is not null then
    v_content:=format('集合信息已变更：%s → %s；时间：%s → %s；原因：%s',v_previous.meeting_name,trim(p_meeting_name),to_char(v_previous.meeting_at at time zone 'Asia/Tokyo','HH24:MI'),to_char(p_meeting_at at time zone 'Asia/Tokyo','HH24:MI'),trim(p_reason));
    insert into public.trip_room_messages(trip_room_id,author_id,content,important,kind,original_content,template_key)
    values(v_room,auth.uid(),v_content,true,'text',v_content,'meeting_changed');
  end if;
  return v_revision;
end$$;

revoke all on function public.update_vehicle_group_meeting(uuid,timestamptz,text,text,numeric,numeric,text,text,text) from public,anon;
grant execute on function public.update_vehicle_group_meeting(uuid,timestamptz,text,text,numeric,numeric,text,text,text) to authenticated,service_role;

create or replace function public.get_operations_system_release_info()
returns table(migration_version text,database_time timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  return query select '202609140144'::text,now() where public.is_operations();
end$$;

revoke all on function public.get_operations_system_release_info() from public,anon;
grant execute on function public.get_operations_system_release_info() to authenticated,service_role;

commit;
