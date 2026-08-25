begin;

alter table public.trip_room_messages
  add column if not exists original_content text,
  add column if not exists translated_content text;

create or replace function public.get_vehicle_group_boarding_status(p_vehicle_group uuid)
returns table(order_id uuid,passenger_label text,seat_count integer,boarding_status text,boarded_at timestamptz,location_shared boolean)
language sql stable security definer set search_path=public,pg_temp as $$
  select o.id,'订单 '||right(o.id::text,6),o.seat_count,coalesce(b.status,'not_issued'),b.boarded_at,
    exists(select 1 from public.location_shares ls where ls.vehicle_group_id=p_vehicle_group and ls.subject_id=o.account_id and ls.stopped_at is null and ls.expires_at>now())
  from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id left join public.boardings b on b.order_id=o.id
  where vgo.vehicle_group_id=p_vehicle_group and (public.is_operations() or public.is_group_staff(p_vehicle_group))
  order by o.created_at,o.id;
$$;

create or replace function public.send_staff_trip_room_template(p_room uuid,p_template_key text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare group_id uuid;message_id uuid;content_value text;
begin
  select vehicle_group_id into group_id from public.trip_rooms where id=p_room and status='open';
  if group_id is null then raise exception 'trip room is not open'; end if;
  if not(public.is_operations() or public.is_group_staff(group_id)) then raise exception 'assigned staff only'; end if;
  content_value:=case p_template_key
    when 'introduce' then '大家好，我是本车工作人员。明天我会在群内协助大家集合与乘车。'
    when 'confirm_meeting' then '请确认明天的集合时间与置顶集合地点，并提前到达。'
    when 'vehicle_arrived' then '车辆已经到达集合点，请按置顶车辆信息寻找本车。'
    when 'departing_10' then '车辆将在 10 分钟后出发，请尽快返回。'
    when 'departing_5' then '车辆将在 5 分钟后出发，请立即返回。'
    when 'return_vehicle' then '请返回车辆；如已走散，可主动临时共享位置。'
    when 'traffic_delay' then '因交通情况行程有所延误，请关注置顶信息。'
    when 'meeting_changed' then '集合地点已经变更，请以最新置顶集合信息为准。'
    else null end;
  if content_value is null then raise exception 'unknown template'; end if;
  insert into public.trip_room_messages(trip_room_id,author_id,content,important,kind,original_content,translated_content)
    values(p_room,auth.uid(),content_value,true,'text',content_value,null) returning id into message_id;
  return message_id;
end$$;

create or replace function public.mark_vehicle_group_order_boarded(p_vehicle_group uuid,p_order uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not(public.is_operations() or public.is_group_staff(p_vehicle_group)) then raise exception 'assigned staff only'; end if;
  if not exists(select 1 from public.vehicle_group_orders where vehicle_group_id=p_vehicle_group and order_id=p_order) then raise exception 'order is not in vehicle group'; end if;
  insert into public.boardings(order_id,status,boarded_at) values(p_order,'boarded',now())
    on conflict(order_id) do update set status='boarded',boarded_at=coalesce(public.boardings.boarded_at,excluded.boarded_at),updated_at=now();
  return true;
end$$;

revoke all on function public.get_vehicle_group_boarding_status(uuid),public.send_staff_trip_room_template(uuid,text),public.mark_vehicle_group_order_boarded(uuid,uuid) from public,anon;
grant execute on function public.get_vehicle_group_boarding_status(uuid),public.send_staff_trip_room_template(uuid,text),public.mark_vehicle_group_order_boarded(uuid,uuid) to authenticated,service_role;

commit;
