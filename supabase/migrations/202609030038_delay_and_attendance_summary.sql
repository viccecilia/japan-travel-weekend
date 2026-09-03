begin;

create table if not exists public.vehicle_group_delays(
  id uuid primary key default gen_random_uuid(),
  vehicle_group_id uuid not null references public.vehicle_groups(id) on delete cascade,
  reported_by uuid not null references public.profiles(id),
  delay_minutes integer not null check(delay_minutes between 1 and 360),
  reason text not null check(length(trim(reason)) between 3 and 500),
  status text not null default 'active' check(status in ('active','resolved','cancelled')),
  idempotency_key text not null,
  reported_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(reported_by,idempotency_key)
);
alter table public.vehicle_group_delays enable row level security;
revoke all on public.vehicle_group_delays from public,anon,authenticated;
grant select on public.vehicle_group_delays to authenticated;
grant all on public.vehicle_group_delays to service_role;
create policy vehicle_group_delays_scope on public.vehicle_group_delays for select to authenticated using(
  public.is_operations() or public.is_group_staff(vehicle_group_id) or exists(
    select 1 from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id
    where vgo.vehicle_group_id=vehicle_group_delays.vehicle_group_id and o.account_id=auth.uid() and o.status in ('paid','confirmed')
  )
);

create or replace function public.report_vehicle_group_delay(p_vehicle_group uuid,p_delay_minutes integer,p_reason text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_delay uuid;v_room uuid;v_content text;v_order record;
begin
  if auth.uid() is null or not(public.is_operations() or public.is_group_staff(p_vehicle_group)) then raise exception 'assigned staff only'; end if;
  if p_delay_minutes not between 1 and 360 or length(trim(p_reason)) not between 3 and 500 or length(trim(p_idempotency_key))<8 then raise exception 'invalid delay'; end if;
  insert into public.vehicle_group_delays(vehicle_group_id,reported_by,delay_minutes,reason,idempotency_key)
  values(p_vehicle_group,auth.uid(),p_delay_minutes,trim(p_reason),p_idempotency_key)
  on conflict(reported_by,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into v_delay;
  insert into public.staff_execution_events(vehicle_group_id,actor_id,event_type,detail,idempotency_key)
  values(p_vehicle_group,auth.uid(),'delay_reported',jsonb_build_object('delayId',v_delay,'minutes',p_delay_minutes,'reason',trim(p_reason)),p_idempotency_key||':event')
  on conflict(actor_id,idempotency_key) do nothing;
  v_content:=format('行程预计延误约 %s 分钟。原因：%s。请以群内后续通知为准。',p_delay_minutes,trim(p_reason));
  select id into v_room from public.trip_rooms where vehicle_group_id=p_vehicle_group and status='open';
  if v_room is not null then
    insert into public.trip_room_messages(trip_room_id,author_id,content,important,kind,original_content,template_key)
    values(v_room,auth.uid(),v_content,true,'text',v_content,'traffic_delay');
  end if;
  for v_order in select o.id,o.account_id from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=p_vehicle_group and o.status in ('paid','confirmed')
  loop
    insert into public.notification_outbox(event_id,event_type,recipient_id,order_id,necessary,payload,status)
    values('delay:'||v_delay::text||':'||v_order.id::text,'departure-delayed',v_order.account_id,v_order.id,true,jsonb_build_object('delayMinutes',p_delay_minutes,'reason',trim(p_reason),'vehicleGroupId',p_vehicle_group),'pending') on conflict(event_id) do nothing;
  end loop;
  return v_delay;
end$$;

create or replace function public.get_vehicle_group_attendance_summary(p_vehicle_group uuid)
returns table(total integer,arrived integer,boarded integer,needs_assistance integer,pending integer,all_present boolean)
language sql stable security definer set search_path=public,pg_temp as $$
  select count(p.id)::integer,
    count(p.id) filter(where pc.status in ('at_meeting_point','boarded'))::integer,
    count(p.id) filter(where pc.status='boarded')::integer,
    count(p.id) filter(where pc.status='needs_assistance')::integer,
    count(p.id) filter(where coalesce(pc.status,'pending') in ('pending','confirmed_departure','contacting','unreachable'))::integer,
    count(p.id)>0 and count(p.id) filter(where pc.status in ('at_meeting_point','boarded'))=count(p.id)
  from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id and o.status in ('paid','confirmed')
  join public.passengers p on p.order_id=o.id left join public.passenger_checkins pc on pc.passenger_id=p.id
  where vgo.vehicle_group_id=p_vehicle_group and (public.is_operations() or public.is_group_staff(p_vehicle_group) or o.account_id=auth.uid());
$$;

revoke all on function public.report_vehicle_group_delay(uuid,integer,text,text),public.get_vehicle_group_attendance_summary(uuid) from public,anon;
grant execute on function public.report_vehicle_group_delay(uuid,integer,text,text),public.get_vehicle_group_attendance_summary(uuid) to authenticated,service_role;
commit;
