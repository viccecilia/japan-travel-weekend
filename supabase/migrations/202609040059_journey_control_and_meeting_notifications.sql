begin;

alter table public.notification_outbox drop constraint if exists notification_outbox_event_type_check;
alter table public.notification_outbox add constraint notification_outbox_event_type_check check(event_type in ('order-confirmed','bank-transfer-pending','meeting-updated','trip-room-opened','departure-reminder','departure-delayed','boarding-completed','checkin-reminder','passenger-contact-escalation','meeting-started','trip-progress','trip-completed'));
alter table public.staff_execution_events drop constraint if exists staff_execution_events_event_type_check;
alter table public.staff_execution_events add constraint staff_execution_events_event_type_check check(event_type in ('task_accepted','meeting_started','meeting_updated','stop_arrived','trip_completed','delay_reported','incident_reported','support_requested'));

create table if not exists public.vehicle_group_journey_state(
  vehicle_group_id uuid primary key references public.vehicle_groups(id) on delete cascade,
  status text not null default 'preparing' check(status in ('preparing','meeting','in_progress','completed')),
  current_stop_name text,
  revision integer not null default 1 check(revision>0),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.vehicle_group_journey_state enable row level security;
revoke all on public.vehicle_group_journey_state from public,anon,authenticated;
grant select on public.vehicle_group_journey_state to authenticated;
grant all on public.vehicle_group_journey_state to service_role;
drop policy if exists journey_state_group_scope on public.vehicle_group_journey_state;
create policy journey_state_group_scope on public.vehicle_group_journey_state for select to authenticated using(
  public.is_operations() or public.is_group_staff(vehicle_group_id) or exists(
    select 1 from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id
    where vgo.vehicle_group_id=vehicle_group_journey_state.vehicle_group_id and o.account_id=auth.uid() and o.status in ('paid','confirmed')
  )
);

create or replace function public.record_staff_execution_event(p_vehicle_group uuid,p_event_type text,p_detail jsonb,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_room uuid;v_content text;v_order record;
begin
  if auth.uid() is null or not(public.is_operations() or public.is_group_staff(p_vehicle_group)) then raise exception 'assigned staff only'; end if;
  if p_event_type not in ('task_accepted','meeting_started','delay_reported','incident_reported','support_requested') or length(trim(p_idempotency_key))<8 then raise exception 'invalid event'; end if;
  if p_event_type in ('delay_reported','incident_reported','support_requested') and length(trim(coalesce(p_detail->>'detail',''))) not between 3 and 800 then raise exception 'detail required'; end if;
  insert into public.staff_execution_events(vehicle_group_id,actor_id,event_type,detail,idempotency_key) values(p_vehicle_group,auth.uid(),p_event_type,coalesce(p_detail,'{}'::jsonb),p_idempotency_key)
  on conflict(actor_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into v_id;
  if p_event_type='meeting_started' then
    update public.vehicle_group_meeting_state set status='active',updated_at=now() where vehicle_group_id=p_vehicle_group and status='scheduled';
    if not found then raise exception 'meeting point must be confirmed first'; end if;
    insert into public.vehicle_group_journey_state(vehicle_group_id,status,current_stop_name,updated_by) select p_vehicle_group,'meeting',m.meeting_name,auth.uid() from public.vehicle_group_meeting_state m where m.vehicle_group_id=p_vehicle_group
      on conflict(vehicle_group_id) do update set status='meeting',current_stop_name=excluded.current_stop_name,revision=public.vehicle_group_journey_state.revision+1,updated_by=excluded.updated_by,updated_at=now();
    select id into v_room from public.trip_rooms where vehicle_group_id=p_vehicle_group and status='open';
    if v_room is null then raise exception 'trip room is not open'; end if;
    v_content:='司导已发起集合，请到达集合点后点击“我已到达”。';
    insert into public.trip_room_messages(trip_room_id,author_id,content,important,kind,original_content,template_key) values(v_room,auth.uid(),v_content,true,'text',v_content,'vehicle_arrived');
    for v_order in select o.id,o.account_id from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=p_vehicle_group and o.status in ('paid','confirmed') loop
      insert into public.notification_outbox(event_id,event_type,recipient_id,order_id,necessary,payload,status)
      values('meeting-started:'||v_id::text||':'||v_order.id::text,'meeting-started',v_order.account_id,v_order.id,true,jsonb_build_object('vehicleGroupId',p_vehicle_group,'message',v_content),'pending') on conflict(event_id) do nothing;
    end loop;
  end if;
  return v_id;
end$$;

create or replace function public.advance_vehicle_group_journey(p_vehicle_group uuid,p_action text,p_stop_name text,p_reason text,p_idempotency_key text)
returns table(status text,current_stop_name text,revision integer,room_status text) language plpgsql security definer set search_path=public,pg_temp as $$
declare v_state public.vehicle_group_journey_state%rowtype;v_room uuid;v_departure uuid;v_content text;v_event text;v_order record;
begin
  if auth.uid() is null or not(public.is_operations() or public.is_group_staff(p_vehicle_group)) then raise exception 'assigned staff only'; end if;
  if p_action not in ('stop_arrived','trip_completed') or length(trim(coalesce(p_reason,''))) not between 3 and 300 or length(trim(p_idempotency_key))<8 then raise exception 'invalid journey transition'; end if;
  if p_action='stop_arrived' and length(trim(coalesce(p_stop_name,''))) not between 2 and 160 then raise exception 'stop name required'; end if;
  select * into v_state from public.vehicle_group_journey_state where vehicle_group_id=p_vehicle_group for update;
  if v_state.status='completed' then raise exception 'journey already completed'; end if;
  v_event:=case when p_action='stop_arrived' then 'stop_arrived' else 'trip_completed' end;
  if exists(select 1 from public.staff_execution_events where actor_id=auth.uid() and idempotency_key=p_idempotency_key) then
    return query select s.status,s.current_stop_name,s.revision,r.status from public.vehicle_group_journey_state s join public.trip_rooms r on r.vehicle_group_id=s.vehicle_group_id where s.vehicle_group_id=p_vehicle_group;return;
  end if;
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

create or replace function public.get_vehicle_group_journey_state(p_vehicle_group uuid)
returns table(status text,current_stop_name text,revision integer,updated_at timestamptz,completed_at timestamptz) language sql stable security definer set search_path=public,pg_temp as $$
  select s.status,s.current_stop_name,s.revision,s.updated_at,s.completed_at from public.vehicle_group_journey_state s where s.vehicle_group_id=p_vehicle_group and (public.is_operations() or public.is_group_staff(p_vehicle_group) or exists(select 1 from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=p_vehicle_group and o.account_id=auth.uid() and o.status in ('paid','confirmed')));
$$;

revoke all on function public.advance_vehicle_group_journey(uuid,text,text,text,text),public.get_vehicle_group_journey_state(uuid) from public,anon;
grant execute on function public.advance_vehicle_group_journey(uuid,text,text,text,text),public.get_vehicle_group_journey_state(uuid) to authenticated,service_role;
revoke all on function public.record_staff_execution_event(uuid,text,jsonb,text) from public,anon;
grant execute on function public.record_staff_execution_event(uuid,text,jsonb,text) to authenticated,service_role;

commit;
