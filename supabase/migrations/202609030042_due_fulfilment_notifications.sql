begin;

create or replace function public.enqueue_due_fulfilment_notifications(p_now timestamptz default now())
returns table(event_type text,enqueued integer)
language plpgsql security definer set search_path=public,pg_temp as $$
declare departure_count integer:=0;room_count integer:=0;checkin_count integer:=0;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_now is null or p_now>now()+interval '5 minutes' or p_now<now()-interval '5 minutes' then raise exception 'invalid scheduler time'; end if;
  with inserted as (
    insert into public.notification_outbox(event_id,event_type,recipient_id,order_id,necessary,payload,status)
    select 'departure-reminder:'||d.id::text||':'||o.id::text,'departure-reminder',o.account_id,o.id,true,jsonb_build_object('departureId',d.id,'departsAt',d.departs_at,'meetingName',d.meeting_name),'pending'
    from public.departures d join public.orders o on o.departure_id=d.id and o.status in ('paid','confirmed')
    where d.status in ('open','closed') and d.departs_at>p_now+interval '30 minutes' and d.departs_at<=p_now+interval '24 hours' and d.meeting_name is not null and d.meeting_address is not null
    on conflict(event_id) do nothing returning 1
  ) select count(*)::integer into departure_count from inserted;
  with inserted as (
    insert into public.notification_outbox(event_id,event_type,recipient_id,order_id,necessary,payload,status)
    select 'trip-room-opened:'||tr.id::text||':'||o.id::text,'trip-room-opened',o.account_id,o.id,true,jsonb_build_object('departureId',vg.departure_id,'tripRoomId',tr.id),'pending'
    from public.trip_rooms tr join public.vehicle_groups vg on vg.id=tr.vehicle_group_id join public.vehicle_group_orders vgo on vgo.vehicle_group_id=vg.id join public.orders o on o.id=vgo.order_id and o.status in ('paid','confirmed') where tr.status='open'
    on conflict(event_id) do nothing returning 1
  ) select count(*)::integer into room_count from inserted;
  with inserted as (
    insert into public.notification_outbox(event_id,event_type,recipient_id,order_id,necessary,payload,status)
    select 'checkin-reminder:'||d.id::text||':'||o.id::text,'checkin-reminder',o.account_id,o.id,true,jsonb_build_object('departureId',d.id),'pending'
    from public.departures d cross join public.trip_attendance_config c join public.orders o on o.departure_id=d.id and o.status in ('paid','confirmed')
    where c.singleton and d.status in ('open','closed') and d.departs_at>p_now and d.departs_at<=p_now+make_interval(mins=>c.first_reminder_minutes_before)
      and exists(select 1 from public.passengers p left join public.passenger_checkins pc on pc.passenger_id=p.id where p.order_id=o.id and coalesce(pc.status,'pending') not in ('at_meeting_point','boarded'))
    on conflict(event_id) do nothing returning 1
  ) select count(*)::integer into checkin_count from inserted;
  return query values('departure-reminder',departure_count),('trip-room-opened',room_count),('checkin-reminder',checkin_count);
end$$;
revoke all on function public.enqueue_due_fulfilment_notifications(timestamptz) from public,anon,authenticated;
grant execute on function public.enqueue_due_fulfilment_notifications(timestamptz) to service_role;
commit;
