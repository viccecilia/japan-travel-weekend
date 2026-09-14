begin;

create or replace function public.advance_vehicle_group_journey(p_vehicle_group uuid,p_action text,p_stop_name text,p_reason text,p_idempotency_key text)
returns table(status text,current_stop_name text,revision integer,room_status text) language plpgsql security definer set search_path=public,pg_temp as $$
declare v_state public.vehicle_group_journey_state%rowtype;v_room uuid;v_departure uuid;v_content text;v_event text;v_order record;
begin
  if auth.uid() is null or not(public.is_operations() or public.is_group_staff(p_vehicle_group)) then raise exception 'assigned staff only'; end if;
  if p_action not in ('stop_arrived','trip_completed') or length(trim(coalesce(p_reason,''))) not between 3 and 300 or length(trim(p_idempotency_key))<8 then raise exception 'invalid journey transition'; end if;
  if p_action='stop_arrived' and length(trim(coalesce(p_stop_name,''))) not between 2 and 160 then raise exception 'stop name required'; end if;
  v_event:=case when p_action='stop_arrived' then 'stop_arrived' else 'trip_completed' end;
  select * into v_state from public.vehicle_group_journey_state where vehicle_group_id=p_vehicle_group for update;
  if exists(select 1 from public.staff_execution_events where actor_id=auth.uid() and idempotency_key=p_idempotency_key and event_type=v_event) then
    return query select s.status,s.current_stop_name,s.revision,r.status from public.vehicle_group_journey_state s join public.trip_rooms r on r.vehicle_group_id=s.vehicle_group_id where s.vehicle_group_id=p_vehicle_group;return;
  end if;
  if v_state.status='completed' then raise exception 'journey already completed'; end if;
  if p_action='stop_arrived' then
    insert into public.vehicle_group_journey_state(vehicle_group_id,status,current_stop_name,updated_by) values(p_vehicle_group,'in_progress',trim(p_stop_name),auth.uid())
      on conflict(vehicle_group_id) do update set status='in_progress',current_stop_name=excluded.current_stop_name,revision=public.vehicle_group_journey_state.revision+1,updated_by=excluded.updated_by,updated_at=now()
      returning * into v_state;
    v_content:=format('已到达%s。%s',trim(p_stop_name),trim(p_reason));
  else
    update public.vehicle_group_journey_state set status='completed',revision=public.vehicle_group_journey_state.revision+1,updated_by=auth.uid(),updated_at=now(),completed_at=now() where vehicle_group_id=p_vehicle_group returning * into v_state;
    if not found then insert into public.vehicle_group_journey_state(vehicle_group_id,status,current_stop_name,updated_by,completed_at) values(p_vehicle_group,'completed',null,auth.uid(),now()) returning * into v_state; end if;
    v_content:=format('本次行程已结束。%s 群聊现已转为只读。',trim(p_reason));
  end if;
  insert into public.staff_execution_events(vehicle_group_id,actor_id,event_type,detail,idempotency_key) values(p_vehicle_group,auth.uid(),v_event,jsonb_build_object('stopName',nullif(trim(coalesce(p_stop_name,'')),''),'reason',trim(p_reason),'revision',v_state.revision),p_idempotency_key);
  select id into v_room from public.trip_rooms where vehicle_group_id=p_vehicle_group;
  if v_room is not null then insert into public.trip_room_messages(trip_room_id,author_id,content,important,kind,original_content,template_key) values(v_room,auth.uid(),v_content,true,'text',v_content,case when p_action='stop_arrived' then 'stop_arrived' else 'trip_completed' end); end if;
  for v_order in select o.id,o.account_id from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=p_vehicle_group and o.status in ('paid','confirmed') loop
    insert into public.notification_outbox(event_id,event_type,recipient_id,order_id,necessary,payload,status) values('journey:'||p_idempotency_key||':'||v_order.id::text,case when p_action='stop_arrived' then 'trip-progress' else 'trip-completed' end,v_order.account_id,v_order.id,true,jsonb_build_object('vehicleGroupId',p_vehicle_group,'stopName',nullif(trim(coalesce(p_stop_name,'')),''),'message',v_content),'pending') on conflict(event_id) do nothing;
  end loop;
  if p_action='trip_completed' then
    update public.trip_rooms set status='closed' where vehicle_group_id=p_vehicle_group;
    update public.driver_location_sessions set stopped_at=coalesce(stopped_at,now()) where vehicle_group_id=p_vehicle_group and stopped_at is null;
    select departure_id into v_departure from public.vehicle_groups where id=p_vehicle_group;
    if not exists(select 1 from public.vehicle_groups vg join public.vehicle_group_journey_state s on s.vehicle_group_id=vg.id where vg.departure_id=v_departure and s.status<>'completed') then update public.departures set status='completed',updated_at=now() where id=v_departure; end if;
  end if;
  return query select v_state.status,v_state.current_stop_name,v_state.revision,(select r.status from public.trip_rooms r where r.vehicle_group_id=p_vehicle_group);
end$$;

revoke all on function public.advance_vehicle_group_journey(uuid,text,text,text,text) from public,anon;
grant execute on function public.advance_vehicle_group_journey(uuid,text,text,text,text) to authenticated,service_role;

create or replace function public.get_operations_system_release_info()
returns table(migration_version text,database_time timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  return query select '202609140145'::text,now() where public.is_operations();
end$$;

revoke all on function public.get_operations_system_release_info() from public,anon;
grant execute on function public.get_operations_system_release_info() to authenticated,service_role;

commit;
