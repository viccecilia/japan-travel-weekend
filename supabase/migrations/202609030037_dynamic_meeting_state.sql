begin;

create table if not exists public.vehicle_group_meeting_state(
  vehicle_group_id uuid primary key references public.vehicle_groups(id) on delete cascade,
  meeting_at timestamptz not null,
  meeting_name text not null check(length(trim(meeting_name)) between 2 and 160),
  meeting_address text not null check(length(trim(meeting_address)) between 3 and 300),
  latitude numeric(9,6) not null check(latitude between -90 and 90),
  longitude numeric(9,6) not null check(longitude between -180 and 180),
  landmark_description text not null default '' check(length(landmark_description)<=500),
  status text not null default 'scheduled' check(status in ('scheduled','active','completed','cancelled')),
  revision integer not null default 1 check(revision>0),
  changed_reason text,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meeting_change_acknowledgements(
  vehicle_group_id uuid not null references public.vehicle_groups(id) on delete cascade,
  revision integer not null check(revision>0),
  account_id uuid not null references public.profiles(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key(vehicle_group_id,revision,account_id)
);

alter table public.vehicle_group_meeting_state enable row level security;
alter table public.meeting_change_acknowledgements enable row level security;
revoke all on public.vehicle_group_meeting_state,public.meeting_change_acknowledgements from public,anon,authenticated;
grant select on public.vehicle_group_meeting_state,public.meeting_change_acknowledgements to authenticated;
grant all on public.vehicle_group_meeting_state,public.meeting_change_acknowledgements to service_role;
create policy meeting_state_group_scope on public.vehicle_group_meeting_state for select to authenticated
using(public.is_operations() or public.is_group_staff(vehicle_group_id) or exists(
  select 1 from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id
  where vgo.vehicle_group_id=vehicle_group_meeting_state.vehicle_group_id and o.account_id=auth.uid() and o.status in ('paid','confirmed')
));
create policy meeting_ack_owner_staff_ops on public.meeting_change_acknowledgements for select to authenticated
using(account_id=auth.uid() or public.is_operations() or public.is_group_staff(vehicle_group_id));

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

alter table public.staff_execution_events drop constraint if exists staff_execution_events_event_type_check;
alter table public.staff_execution_events add constraint staff_execution_events_event_type_check check(event_type in ('task_accepted','meeting_started','meeting_updated','delay_reported','incident_reported','support_requested'));

create or replace function public.get_current_vehicle_group_meeting(p_vehicle_group uuid)
returns table(vehicle_group_id uuid,meeting_at timestamptz,meeting_name text,meeting_address text,latitude numeric,longitude numeric,landmark_description text,status text,revision integer,changed_reason text,changed_at timestamptz,acknowledged boolean)
language sql stable security definer set search_path=public,pg_temp as $$
  select m.vehicle_group_id,m.meeting_at,m.meeting_name,m.meeting_address,m.latitude,m.longitude,m.landmark_description,m.status,m.revision,m.changed_reason,m.changed_at,
    exists(select 1 from public.meeting_change_acknowledgements a where a.vehicle_group_id=m.vehicle_group_id and a.revision=m.revision and a.account_id=auth.uid())
  from public.vehicle_group_meeting_state m where m.vehicle_group_id=p_vehicle_group and (
    public.is_operations() or public.is_group_staff(m.vehicle_group_id) or exists(select 1 from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=m.vehicle_group_id and o.account_id=auth.uid() and o.status in ('paid','confirmed'))
  );
$$;

create or replace function public.acknowledge_vehicle_group_meeting(p_vehicle_group uuid,p_revision integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not exists(select 1 from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=p_vehicle_group and o.account_id=auth.uid() and o.status in ('paid','confirmed')) then raise exception 'passenger only'; end if;
  if not exists(select 1 from public.vehicle_group_meeting_state where vehicle_group_id=p_vehicle_group and revision=p_revision) then raise exception 'stale meeting revision'; end if;
  insert into public.meeting_change_acknowledgements(vehicle_group_id,revision,account_id) values(p_vehicle_group,p_revision,auth.uid()) on conflict do nothing;
  return true;
end$$;

create or replace function public.record_staff_execution_event(p_vehicle_group uuid,p_event_type text,p_detail jsonb,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_room uuid;v_content text;
begin
  if auth.uid() is null or not(public.is_operations() or public.is_group_staff(p_vehicle_group)) then raise exception 'assigned staff only'; end if;
  if p_event_type not in ('task_accepted','meeting_started','delay_reported','incident_reported','support_requested') or length(trim(p_idempotency_key))<8 then raise exception 'invalid event'; end if;
  if p_event_type in ('delay_reported','incident_reported','support_requested') and length(trim(coalesce(p_detail->>'detail',''))) not between 3 and 800 then raise exception 'detail required'; end if;
  insert into public.staff_execution_events(vehicle_group_id,actor_id,event_type,detail,idempotency_key) values(p_vehicle_group,auth.uid(),p_event_type,coalesce(p_detail,'{}'::jsonb),p_idempotency_key)
  on conflict(actor_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into v_id;
  if p_event_type='meeting_started' then
    update public.vehicle_group_meeting_state set status='active',updated_at=now() where vehicle_group_id=p_vehicle_group and status='scheduled';
    if not found then raise exception 'meeting point must be confirmed first'; end if;
    select id into v_room from public.trip_rooms where vehicle_group_id=p_vehicle_group and status='open';
    if v_room is null then raise exception 'trip room is not open'; end if;
    v_content:='司导已发起集合，请到达集合点后点击“我已到达”。';
    insert into public.trip_room_messages(trip_room_id,author_id,content,important,kind,original_content,template_key) values(v_room,auth.uid(),v_content,true,'text',v_content,'vehicle_arrived');
  end if;
  return v_id;
end$$;

revoke all on function public.update_vehicle_group_meeting(uuid,timestamptz,text,text,numeric,numeric,text,text,text),public.get_current_vehicle_group_meeting(uuid),public.acknowledge_vehicle_group_meeting(uuid,integer) from public,anon;
grant execute on function public.update_vehicle_group_meeting(uuid,timestamptz,text,text,numeric,numeric,text,text,text),public.get_current_vehicle_group_meeting(uuid),public.acknowledge_vehicle_group_meeting(uuid,integer) to authenticated,service_role;
commit;
