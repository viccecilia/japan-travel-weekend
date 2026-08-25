begin;

-- Broadcast authorization is cached when a channel joins, so it must not enforce a changing room state.
-- Durable message writes below re-check room status for every request.
drop policy if exists vehicle_group_private_send on realtime.messages;

alter table public.trip_room_messages add column if not exists client_message_id text;
create unique index if not exists trip_room_messages_author_client_key
  on public.trip_room_messages(author_id,client_message_id) where client_message_id is not null;

create table if not exists public.passenger_checkins (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null unique references public.passengers(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  vehicle_group_id uuid not null references public.vehicle_groups(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','confirmed_departure','at_meeting_point','boarded','needs_assistance','contacting','unreachable','no_show_confirmed')),
  status_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(vehicle_group_id,passenger_id)
);

create table if not exists public.passenger_checkin_events (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.passenger_checkins(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  idempotency_key text not null,
  status text not null,
  created_at timestamptz not null default now(),
  unique(actor_id,idempotency_key)
);

create table if not exists public.passenger_contact_actions (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.passenger_checkins(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  idempotency_key text not null,
  action text not null check(action in ('contact_requested','contacting','reached','unreachable','escalated_to_operations','resolved')),
  note text check(note is null or length(note)<=500),
  created_at timestamptz not null default now(),
  unique(actor_id,idempotency_key)
);

create table if not exists public.trip_attendance_config (
  singleton boolean primary key default true check(singleton),
  confirm_departure_minutes integer not null default 60 check(confirm_departure_minutes between 0 and 1440),
  arrival_checkin_minutes integer not null default 30 check(arrival_checkin_minutes between 0 and 1440),
  first_reminder_minutes_before integer not null default 10 check(first_reminder_minutes_before between 0 and 1440),
  staff_contact_minutes_after integer not null default 5 check(staff_contact_minutes_after between 0 and 180),
  updated_at timestamptz not null default now()
);
insert into public.trip_attendance_config(singleton) values(true) on conflict(singleton) do nothing;

alter table public.notification_outbox drop constraint if exists notification_outbox_event_type_check;
alter table public.notification_outbox add constraint notification_outbox_event_type_check check(event_type in ('order-confirmed','bank-transfer-pending','meeting-updated','trip-room-opened','departure-reminder','departure-delayed','boarding-completed','checkin-reminder','passenger-contact-escalation'));

alter table public.passenger_checkins enable row level security;
alter table public.passenger_checkin_events enable row level security;
alter table public.passenger_contact_actions enable row level security;
alter table public.trip_attendance_config enable row level security;
revoke all on public.passenger_checkins,public.passenger_checkin_events,public.passenger_contact_actions from public,anon,authenticated;
grant all on public.passenger_checkins,public.passenger_checkin_events,public.passenger_contact_actions to service_role;
revoke all on public.trip_attendance_config from public,anon,authenticated;
grant select on public.trip_attendance_config to authenticated,service_role;
create policy attendance_config_authenticated_read on public.trip_attendance_config for select to authenticated using(true);

create policy passenger_checkins_owner_staff_ops on public.passenger_checkins for select to authenticated using (
  public.is_order_owner(order_id) or public.is_operations() or public.is_group_staff(vehicle_group_id)
);
create policy passenger_checkin_events_owner_staff_ops on public.passenger_checkin_events for select to authenticated using (
  exists(select 1 from public.passenger_checkins pc where pc.id=checkin_id and (public.is_order_owner(pc.order_id) or public.is_operations() or public.is_group_staff(pc.vehicle_group_id)))
);
create policy passenger_contact_actions_staff_ops on public.passenger_contact_actions for select to authenticated using (
  exists(select 1 from public.passenger_checkins pc where pc.id=checkin_id and (public.is_operations() or public.is_group_staff(pc.vehicle_group_id)))
);
grant select on public.passenger_checkins,public.passenger_checkin_events,public.passenger_contact_actions to authenticated;

create or replace function public.send_trip_room_message(p_room uuid,p_content text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_group uuid;v_message uuid;v_existing record;
begin
  if auth.uid() is null or length(trim(p_content)) not between 1 and 2000 or length(p_idempotency_key) not between 8 and 200 then raise exception 'invalid message request'; end if;
  select m.id,m.trip_room_id,m.content into v_existing from public.trip_room_messages m where m.author_id=auth.uid() and m.client_message_id=p_idempotency_key;
  if found then
    if v_existing.trip_room_id<>p_room or v_existing.content<>trim(p_content) then raise exception 'message idempotency mismatch'; end if;
    return v_existing.id;
  end if;
  select tr.vehicle_group_id into v_group from public.trip_rooms tr where tr.id=p_room and tr.status='open' for share;
  if v_group is null or not public.can_receive_vehicle_group(v_group) then raise exception 'trip room message not allowed'; end if;
  insert into public.trip_room_messages(trip_room_id,author_id,content,client_message_id)
    values(p_room,auth.uid(),trim(p_content),p_idempotency_key) returning id into v_message;
  return v_message;
end$$;

create or replace function public.set_own_passenger_checkin(p_passenger uuid,p_status text,p_idempotency_key text)
returns table(checkin_id uuid,status text,status_at timestamptz) language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order uuid;v_group uuid;v_checkin public.passenger_checkins%rowtype;v_prior public.passenger_checkin_events%rowtype;
begin
  if auth.uid() is null or p_status not in ('confirmed_departure','at_meeting_point','needs_assistance') or length(p_idempotency_key) not between 8 and 200 then raise exception 'invalid passenger check-in'; end if;
  select p.order_id,vgo.vehicle_group_id into v_order,v_group from public.passengers p join public.orders o on o.id=p.order_id join public.vehicle_group_orders vgo on vgo.order_id=o.id where p.id=p_passenger and o.account_id=auth.uid();
  if v_order is null then raise exception 'passenger check-in not allowed'; end if;
  select e.* into v_prior from public.passenger_checkin_events e where e.actor_id=auth.uid() and e.idempotency_key=p_idempotency_key;
  if found then
    select pc.* into v_checkin from public.passenger_checkins pc where pc.id=v_prior.checkin_id;
    if v_checkin.passenger_id<>p_passenger or v_prior.status<>p_status then raise exception 'check-in idempotency mismatch'; end if;
    return query select v_checkin.id,v_checkin.status,v_checkin.status_at;return;
  end if;
  insert into public.passenger_checkins(passenger_id,order_id,vehicle_group_id,status,status_at,updated_by)
    values(p_passenger,v_order,v_group,p_status,now(),auth.uid())
    on conflict(passenger_id) do update set status=excluded.status,status_at=excluded.status_at,updated_by=excluded.updated_by,updated_at=now()
    returning * into v_checkin;
  insert into public.passenger_checkin_events(checkin_id,actor_id,idempotency_key,status) values(v_checkin.id,auth.uid(),p_idempotency_key,p_status);
  return query select v_checkin.id,v_checkin.status,v_checkin.status_at;
end$$;

create or replace function public.set_staff_passenger_checkin(p_vehicle_group uuid,p_passenger uuid,p_status text,p_idempotency_key text)
returns table(checkin_id uuid,status text,status_at timestamptz) language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order uuid;v_checkin public.passenger_checkins%rowtype;v_prior public.passenger_checkin_events%rowtype;
begin
  if auth.uid() is null or not(public.is_operations() or public.is_group_staff(p_vehicle_group)) then raise exception 'assigned staff only'; end if;
  if p_status not in ('at_meeting_point','boarded','needs_assistance','contacting','unreachable') or length(p_idempotency_key) not between 8 and 200 then raise exception 'invalid staff check-in'; end if;
  select p.order_id into v_order from public.passengers p join public.vehicle_group_orders vgo on vgo.order_id=p.order_id where p.id=p_passenger and vgo.vehicle_group_id=p_vehicle_group;
  if v_order is null then raise exception 'passenger is not in vehicle group'; end if;
  select e.* into v_prior from public.passenger_checkin_events e where e.actor_id=auth.uid() and e.idempotency_key=p_idempotency_key;
  if found then
    select pc.* into v_checkin from public.passenger_checkins pc where pc.id=v_prior.checkin_id;
    if v_checkin.passenger_id<>p_passenger or v_prior.status<>p_status then raise exception 'check-in idempotency mismatch'; end if;
    return query select v_checkin.id,v_checkin.status,v_checkin.status_at;return;
  end if;
  insert into public.passenger_checkins(passenger_id,order_id,vehicle_group_id,status,status_at,updated_by)
    values(p_passenger,v_order,p_vehicle_group,p_status,now(),auth.uid())
    on conflict(passenger_id) do update set status=excluded.status,status_at=excluded.status_at,updated_by=excluded.updated_by,updated_at=now()
    returning * into v_checkin;
  insert into public.passenger_checkin_events(checkin_id,actor_id,idempotency_key,status) values(v_checkin.id,auth.uid(),p_idempotency_key,p_status);
  if p_status='boarded' and not exists(select 1 from public.passengers p left join public.passenger_checkins pc on pc.passenger_id=p.id where p.order_id=v_order and coalesce(pc.status,'pending')<>'boarded') then
    insert into public.boardings(order_id,status,boarded_at) values(v_order,'boarded',now()) on conflict(order_id) do update set status='boarded',boarded_at=coalesce(public.boardings.boarded_at,excluded.boarded_at),updated_at=now();
  end if;
  return query select v_checkin.id,v_checkin.status,v_checkin.status_at;
end$$;

create or replace function public.record_passenger_contact_action(p_vehicle_group uuid,p_passenger uuid,p_action text,p_idempotency_key text,p_note text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_checkin public.passenger_checkins%rowtype;v_action uuid;v_prior public.passenger_contact_actions%rowtype;v_role public.app_role;v_order uuid;v_departs_at timestamptz;v_contact_after integer;
begin
  if auth.uid() is null or not(public.is_operations() or public.is_group_staff(p_vehicle_group)) then raise exception 'assigned staff only'; end if;
  select role into v_role from public.profiles where id=auth.uid();
  if p_action not in ('contact_requested','contacting','reached','unreachable','escalated_to_operations','resolved') or length(p_idempotency_key) not between 8 and 200 or length(coalesce(p_note,''))>500 then raise exception 'invalid contact action'; end if;
  if p_action='resolved' and v_role<>'operations' then raise exception 'operations approval required'; end if;
  select p.order_id into v_order from public.passengers p join public.vehicle_group_orders vgo on vgo.order_id=p.order_id where p.id=p_passenger and vgo.vehicle_group_id=p_vehicle_group;
  if v_order is null then raise exception 'passenger is not in vehicle group'; end if;
  select d.departs_at,c.staff_contact_minutes_after into v_departs_at,v_contact_after from public.vehicle_groups vg join public.departures d on d.id=vg.departure_id cross join public.trip_attendance_config c where vg.id=p_vehicle_group and c.singleton;
  if p_action in ('contact_requested','contacting','unreachable') and not public.is_operations() and (v_departs_at is null or now()<v_departs_at+make_interval(mins=>v_contact_after)) then raise exception 'contact escalation not yet available'; end if;
  insert into public.passenger_checkins(passenger_id,order_id,vehicle_group_id,status,status_at,updated_by)
    values(p_passenger,v_order,p_vehicle_group,'pending',now(),auth.uid()) on conflict(passenger_id) do nothing;
  select pc.* into v_checkin from public.passenger_checkins pc where pc.passenger_id=p_passenger and pc.vehicle_group_id=p_vehicle_group for update;
  select a.* into v_prior from public.passenger_contact_actions a where a.actor_id=auth.uid() and a.idempotency_key=p_idempotency_key;
  if found then
    if v_prior.checkin_id<>v_checkin.id or v_prior.action<>p_action or coalesce(v_prior.note,'')<>coalesce(p_note,'') then raise exception 'contact idempotency mismatch'; end if;
    return v_prior.id;
  end if;
  insert into public.passenger_contact_actions(checkin_id,actor_id,idempotency_key,action,note) values(v_checkin.id,auth.uid(),p_idempotency_key,p_action,p_note) returning id into v_action;
  if p_action in ('contact_requested','contacting') then update public.passenger_checkins set status='contacting',status_at=now(),updated_by=auth.uid(),updated_at=now() where id=v_checkin.id;
  elsif p_action='unreachable' then update public.passenger_checkins set status='unreachable',status_at=now(),updated_by=auth.uid(),updated_at=now() where id=v_checkin.id;
  end if;
  return v_action;
end$$;

create or replace function public.get_vehicle_group_attendance(p_vehicle_group uuid)
returns table(passenger_id uuid,passenger_label text,order_id uuid,status text,status_at timestamptz,contact_status text) language sql stable security definer set search_path=public,pg_temp as $$
  select p.id,case when public.is_operations() or public.is_group_staff(p_vehicle_group) then coalesce(nullif(p.display_name,''),'乘客') else coalesce(nullif(p.display_name,''),'本人乘客') end,p.order_id,coalesce(pc.status,'pending'),pc.status_at,
    case when public.is_operations() or public.is_group_staff(p_vehicle_group) then (select a.action from public.passenger_contact_actions a where a.checkin_id=pc.id order by a.created_at desc limit 1) else null end
  from public.passengers p join public.orders o on o.id=p.order_id join public.vehicle_group_orders vgo on vgo.order_id=o.id left join public.passenger_checkins pc on pc.passenger_id=p.id
  where vgo.vehicle_group_id=p_vehicle_group and (o.account_id=auth.uid() or public.is_operations() or public.is_group_staff(p_vehicle_group)) order by o.created_at,p.created_at;
$$;

revoke insert on public.trip_room_messages from authenticated;
revoke all on function public.send_trip_room_message(uuid,text,text),public.set_own_passenger_checkin(uuid,text,text),public.set_staff_passenger_checkin(uuid,uuid,text,text),public.record_passenger_contact_action(uuid,uuid,text,text,text),public.get_vehicle_group_attendance(uuid) from public,anon;
grant execute on function public.send_trip_room_message(uuid,text,text),public.set_own_passenger_checkin(uuid,text,text),public.set_staff_passenger_checkin(uuid,uuid,text,text),public.record_passenger_contact_action(uuid,uuid,text,text,text),public.get_vehicle_group_attendance(uuid) to authenticated,service_role;

do $$begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='trip_room_messages') then execute 'alter publication supabase_realtime add table public.trip_room_messages'; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='trip_rooms') then execute 'alter publication supabase_realtime add table public.trip_rooms'; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='passenger_checkins') then execute 'alter publication supabase_realtime add table public.passenger_checkins'; end if;
end$$;

commit;
