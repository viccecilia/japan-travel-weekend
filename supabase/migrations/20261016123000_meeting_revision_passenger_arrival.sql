begin;

alter table public.passenger_checkins
  add column if not exists meeting_revision integer check(meeting_revision is null or meeting_revision>0);
alter table public.passenger_checkin_events
  add column if not exists meeting_revision integer check(meeting_revision is null or meeting_revision>0);

drop function if exists public.set_own_passenger_checkin(uuid,text,text);
create function public.set_own_passenger_checkin(
  p_passenger uuid,
  p_status text,
  p_idempotency_key text,
  p_vehicle_group uuid default null,
  p_meeting_revision integer default null
)
returns table(checkin_id uuid,status text,status_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_order uuid;
  v_group uuid;
  v_meeting public.vehicle_group_meeting_state%rowtype;
  v_checkin public.passenger_checkins%rowtype;
  v_prior public.passenger_checkin_events%rowtype;
begin
  if auth.uid() is null
    or p_status not in ('confirmed_departure','at_meeting_point','needs_assistance')
    or length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid passenger check-in';
  end if;

  select p.order_id,vgo.vehicle_group_id into v_order,v_group
  from public.passengers p
  join public.orders o on o.id=p.order_id
  join public.vehicle_group_orders vgo on vgo.order_id=o.id
  where p.id=p_passenger and o.account_id=auth.uid() and o.status in ('paid','confirmed')
    and (p_vehicle_group is null or vgo.vehicle_group_id=p_vehicle_group);
  if v_order is null then raise exception 'passenger check-in not allowed'; end if;

  if p_status='at_meeting_point' then
    if p_vehicle_group is null or p_meeting_revision is null or v_group<>p_vehicle_group then
      raise exception 'meeting context required';
    end if;
    select * into v_meeting from public.vehicle_group_meeting_state
      where vehicle_group_id=v_group for share;
    if v_meeting.vehicle_group_id is null or v_meeting.status<>'active' or v_meeting.revision<>p_meeting_revision then
      raise exception 'stale or inactive meeting';
    end if;
    if not public.is_vehicle_group_executable(v_group)
      or not exists(select 1 from public.trip_rooms r where r.vehicle_group_id=v_group and r.status='open') then
      raise exception 'vehicle group is not open';
    end if;
  end if;

  select e.* into v_prior from public.passenger_checkin_events e
    where e.actor_id=auth.uid() and e.idempotency_key=p_idempotency_key;
  if found then
    select pc.* into v_checkin from public.passenger_checkins pc where pc.id=v_prior.checkin_id;
    if v_checkin.passenger_id<>p_passenger or v_prior.status<>p_status
      or coalesce(v_prior.meeting_revision,0)<>coalesce(p_meeting_revision,0) then
      raise exception 'check-in idempotency mismatch';
    end if;
    return query select v_checkin.id,v_checkin.status,v_checkin.status_at; return;
  end if;

  select * into v_checkin from public.passenger_checkins where passenger_id=p_passenger for update;
  if v_checkin.status='boarded' and p_status<>'boarded' then
    return query select v_checkin.id,v_checkin.status,v_checkin.status_at; return;
  end if;
  if v_checkin.id is not null and v_checkin.status=p_status
    and coalesce(v_checkin.meeting_revision,0)=coalesce(p_meeting_revision,0) then
    return query select v_checkin.id,v_checkin.status,v_checkin.status_at; return;
  end if;

  insert into public.passenger_checkins(passenger_id,order_id,vehicle_group_id,status,status_at,updated_by,meeting_revision)
  values(p_passenger,v_order,v_group,p_status,now(),auth.uid(),case when p_status='at_meeting_point' then p_meeting_revision else null end)
  on conflict(passenger_id) do update set
    status=excluded.status,status_at=excluded.status_at,updated_by=excluded.updated_by,
    meeting_revision=excluded.meeting_revision,updated_at=now()
  returning * into v_checkin;
  insert into public.passenger_checkin_events(checkin_id,actor_id,idempotency_key,status,meeting_revision)
  values(v_checkin.id,auth.uid(),p_idempotency_key,p_status,case when p_status='at_meeting_point' then p_meeting_revision else null end);
  return query select v_checkin.id,v_checkin.status,v_checkin.status_at;
end$$;

create or replace function public.set_staff_passenger_checkin(p_vehicle_group uuid,p_passenger uuid,p_status text,p_idempotency_key text)
returns table(checkin_id uuid,status text,status_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
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
  select * into v_checkin from public.passenger_checkins where passenger_id=p_passenger for update;
  if v_checkin.status='boarded' and p_status<>'boarded' then
    return query select v_checkin.id,v_checkin.status,v_checkin.status_at;return;
  end if;
  insert into public.passenger_checkins(passenger_id,order_id,vehicle_group_id,status,status_at,updated_by,meeting_revision)
    values(p_passenger,v_order,p_vehicle_group,p_status,now(),auth.uid(),case when p_status='at_meeting_point' then (select revision from public.vehicle_group_meeting_state where vehicle_group_id=p_vehicle_group) else null end)
    on conflict(passenger_id) do update set status=excluded.status,status_at=excluded.status_at,updated_by=excluded.updated_by,meeting_revision=excluded.meeting_revision,updated_at=now()
    returning * into v_checkin;
  insert into public.passenger_checkin_events(checkin_id,actor_id,idempotency_key,status,meeting_revision) values(v_checkin.id,auth.uid(),p_idempotency_key,p_status,v_checkin.meeting_revision);
  if p_status='boarded' and not exists(select 1 from public.passengers p left join public.passenger_checkins pc on pc.passenger_id=p.id where p.order_id=v_order and coalesce(pc.status,'pending')<>'boarded') then
    insert into public.boardings(order_id,status,boarded_at) values(v_order,'boarded',now()) on conflict(order_id) do update set status='boarded',boarded_at=coalesce(public.boardings.boarded_at,excluded.boarded_at),updated_at=now();
  end if;
  return query select v_checkin.id,v_checkin.status,v_checkin.status_at;
end$$;

drop function if exists public.get_vehicle_group_attendance(uuid);
create function public.get_vehicle_group_attendance(p_vehicle_group uuid)
returns table(passenger_id uuid,passenger_label text,order_id uuid,status text,status_at timestamptz,contact_status text,late_minutes integer,meeting_revision integer)
language sql stable security definer set search_path=public,pg_temp as $$
  select p.id,
    case when public.is_operations() or public.is_group_staff(p_vehicle_group) then coalesce(nullif(p.display_name,''),'乘客') else coalesce(nullif(p.display_name,''),'本人乘客') end,
    p.order_id,coalesce(pc.status,'pending'),pc.status_at,
    case when public.is_operations() or public.is_group_staff(p_vehicle_group) then (select a.action from public.passenger_contact_actions a where a.checkin_id=pc.id order by a.created_at desc limit 1) else null end,
    pc.late_minutes,pc.meeting_revision
  from public.passengers p
  join public.orders o on o.id=p.order_id
  join public.vehicle_group_orders vgo on vgo.order_id=o.id
  left join public.passenger_checkins pc on pc.passenger_id=p.id
  where vgo.vehicle_group_id=p_vehicle_group and o.status in ('paid','confirmed')
    and (o.account_id=auth.uid() or public.is_operations() or public.is_group_staff(p_vehicle_group))
  order by o.created_at,p.created_at;
$$;

revoke all on function public.set_own_passenger_checkin(uuid,text,text,uuid,integer),public.set_staff_passenger_checkin(uuid,uuid,text,text),public.get_vehicle_group_attendance(uuid) from public,anon;
grant execute on function public.set_own_passenger_checkin(uuid,text,text,uuid,integer),public.set_staff_passenger_checkin(uuid,uuid,text,text),public.get_vehicle_group_attendance(uuid) to authenticated,service_role;

commit;
