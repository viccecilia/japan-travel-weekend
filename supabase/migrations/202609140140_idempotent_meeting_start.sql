begin;

create or replace function public.record_staff_execution_event(
  p_vehicle_group uuid,
  p_event_type text,
  p_detail jsonb,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_id uuid;
  v_room uuid;
  v_content text;
  v_order record;
begin
  if auth.uid() is null or not(public.is_operations() or public.is_group_staff(p_vehicle_group)) then
    raise exception 'assigned staff only';
  end if;
  if p_event_type not in ('task_accepted','meeting_started','delay_reported','incident_reported','support_requested')
    or length(trim(p_idempotency_key))<8 then
    raise exception 'invalid event';
  end if;
  if p_event_type in ('delay_reported','incident_reported','support_requested')
    and length(trim(coalesce(p_detail->>'detail',''))) not between 3 and 800 then
    raise exception 'detail required';
  end if;

  select id into v_id
  from public.staff_execution_events
  where actor_id=auth.uid() and idempotency_key=p_idempotency_key;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.staff_execution_events(vehicle_group_id,actor_id,event_type,detail,idempotency_key)
  values(p_vehicle_group,auth.uid(),p_event_type,coalesce(p_detail,'{}'::jsonb),p_idempotency_key)
  returning id into v_id;

  if p_event_type='meeting_started' then
    update public.vehicle_group_meeting_state
    set status='active',updated_at=now()
    where vehicle_group_id=p_vehicle_group and status='scheduled';
    if not found then raise exception 'meeting point must be confirmed first'; end if;

    insert into public.vehicle_group_journey_state(vehicle_group_id,status,current_stop_name,updated_by)
    select p_vehicle_group,'meeting',m.meeting_name,auth.uid()
    from public.vehicle_group_meeting_state m where m.vehicle_group_id=p_vehicle_group
    on conflict(vehicle_group_id) do update set
      status='meeting',current_stop_name=excluded.current_stop_name,
      revision=public.vehicle_group_journey_state.revision+1,
      updated_by=excluded.updated_by,updated_at=now();

    select id into v_room from public.trip_rooms
    where vehicle_group_id=p_vehicle_group and status='open';
    if v_room is null then raise exception 'trip room is not open'; end if;
    v_content:='司导已发起集合，请到达集合点后点击“我已到达”。';
    insert into public.trip_room_messages(trip_room_id,author_id,content,important,kind,original_content,template_key)
    values(v_room,auth.uid(),v_content,true,'text',v_content,'vehicle_arrived');

    for v_order in
      select o.id,o.account_id
      from public.vehicle_group_orders vgo
      join public.orders o on o.id=vgo.order_id
      where vgo.vehicle_group_id=p_vehicle_group and o.status in ('paid','confirmed')
    loop
      insert into public.notification_outbox(event_id,event_type,recipient_id,order_id,necessary,payload,status)
      values(
        'meeting-started:'||v_id::text||':'||v_order.id::text,
        'meeting-started',v_order.account_id,v_order.id,true,
        jsonb_build_object('vehicleGroupId',p_vehicle_group,'message',v_content),'pending'
      ) on conflict(event_id) do nothing;
    end loop;
  end if;
  return v_id;
end$$;

revoke all on function public.record_staff_execution_event(uuid,text,jsonb,text) from public,anon;
grant execute on function public.record_staff_execution_event(uuid,text,jsonb,text) to authenticated,service_role;

create or replace function public.get_operations_system_release_info()
returns table(migration_version text,database_time timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  return query select '202609140140'::text,now() where public.is_operations();
end$$;

revoke all on function public.get_operations_system_release_info() from public,anon;
grant execute on function public.get_operations_system_release_info() to authenticated,service_role;

commit;
