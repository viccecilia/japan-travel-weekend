begin;

alter table public.passenger_checkins
  add column if not exists late_minutes integer check(late_minutes is null or late_minutes in (5,10,15));

create or replace function public.report_own_late_arrival(p_passenger uuid,p_minutes integer,p_idempotency_key text)
returns table(checkin_id uuid,late_minutes integer,reported_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order uuid;v_group uuid;v_room uuid;v_checkin public.passenger_checkins%rowtype;v_prior public.passenger_checkin_events%rowtype;v_message text;
begin
  if auth.uid() is null or p_minutes not in (5,10,15) or length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid late report';
  end if;
  select p.order_id,vgo.vehicle_group_id into v_order,v_group
    from public.passengers p join public.orders o on o.id=p.order_id
    join public.vehicle_group_orders vgo on vgo.order_id=o.id
    where p.id=p_passenger and o.account_id=auth.uid();
  if v_order is null then raise exception 'late report not allowed'; end if;

  select e.* into v_prior from public.passenger_checkin_events e where e.actor_id=auth.uid() and e.idempotency_key=p_idempotency_key;
  if found then
    select pc.* into v_checkin from public.passenger_checkins pc where pc.id=v_prior.checkin_id;
    if v_checkin.passenger_id<>p_passenger or v_prior.status<>('late_'||p_minutes) then raise exception 'late report idempotency mismatch'; end if;
    return query select v_checkin.id,v_checkin.late_minutes,v_checkin.status_at;return;
  end if;

  insert into public.passenger_checkins(passenger_id,order_id,vehicle_group_id,status,status_at,updated_by,late_minutes)
    values(p_passenger,v_order,v_group,'needs_assistance',now(),auth.uid(),p_minutes)
    on conflict(passenger_id) do update set status='needs_assistance',status_at=now(),updated_by=auth.uid(),updated_at=now(),late_minutes=excluded.late_minutes
    returning * into v_checkin;

  insert into public.passenger_checkin_events(checkin_id,actor_id,idempotency_key,status)
    values(v_checkin.id,auth.uid(),p_idempotency_key,'late_'||p_minutes);

  select id into v_room from public.trip_rooms where vehicle_group_id=v_group and status='open' order by created_at desc limit 1;
  if v_room is not null and not exists(select 1 from public.trip_room_messages where author_id=auth.uid() and client_message_id=p_idempotency_key) then
    v_message=case when p_minutes=15 then '我可能迟到15分钟以上。' else '我可能迟到约'||p_minutes||'分钟。' end;
    insert into public.trip_room_messages(trip_room_id,author_id,content,original_content,source_language,client_message_id,important)
      values(v_room,auth.uid(),v_message,v_message,'zh-CN',p_idempotency_key,true);
  end if;
  return query select v_checkin.id,v_checkin.late_minutes,v_checkin.status_at;
end$$;

drop function if exists public.get_vehicle_group_attendance(uuid);
create function public.get_vehicle_group_attendance(p_vehicle_group uuid)
returns table(passenger_id uuid,passenger_label text,order_id uuid,status text,status_at timestamptz,contact_status text,late_minutes integer)
language sql stable security definer set search_path=public,pg_temp as $$
  select p.id,case when public.is_operations() or public.is_group_staff(p_vehicle_group) then coalesce(nullif(p.display_name,''),'乘客') else coalesce(nullif(p.display_name,''),'本人乘客') end,p.order_id,coalesce(pc.status,'pending'),pc.status_at,
    case when public.is_operations() or public.is_group_staff(p_vehicle_group) then (select a.action from public.passenger_contact_actions a where a.checkin_id=pc.id order by a.created_at desc limit 1) else null end,
    pc.late_minutes
  from public.passengers p join public.orders o on o.id=p.order_id join public.vehicle_group_orders vgo on vgo.order_id=o.id left join public.passenger_checkins pc on pc.passenger_id=p.id
  where vgo.vehicle_group_id=p_vehicle_group and (o.account_id=auth.uid() or public.is_operations() or public.is_group_staff(p_vehicle_group)) order by o.created_at,p.created_at;
$$;

revoke all on function public.report_own_late_arrival(uuid,integer,text) from public,anon;
grant execute on function public.report_own_late_arrival(uuid,integer,text) to authenticated,service_role;
revoke all on function public.get_vehicle_group_attendance(uuid) from public,anon;
grant execute on function public.get_vehicle_group_attendance(uuid) to authenticated,service_role;

commit;
