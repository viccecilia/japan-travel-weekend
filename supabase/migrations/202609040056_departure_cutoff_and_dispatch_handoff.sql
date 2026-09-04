begin;

alter table public.departures
  add column if not exists booking_closes_at timestamptz,
  add column if not exists chat_opens_at timestamptz,
  add column if not exists dispatch_planning_status text not null default 'collecting'
    check(dispatch_planning_status in ('collecting','ready_for_planning','needs_manual_review','planned','confirmed'));

-- Existing isolated-test fixtures may predate the complete sellable product
-- contract. Keep strict validation for inserts and commerce-field changes, but
-- allow independent lifecycle/audit fields to be backfilled safely.
create or replace function public.guard_sellable_departure()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare commerce_changed boolean;
begin
  commerce_changed:=tg_op='INSERT' or (
    new.status,new.departs_at,new.ends_at,new.sales_open_at,new.sales_close_at,new.minimum_guests,
    new.capacity,new.seat_price_jpy,new.currency,new.tax_included,new.meeting_name,new.meeting_address,new.map_lat,new.map_lng
  ) is distinct from (
    old.status,old.departs_at,old.ends_at,old.sales_open_at,old.sales_close_at,old.minimum_guests,
    old.capacity,old.seat_price_jpy,old.currency,old.tax_included,old.meeting_name,old.meeting_address,old.map_lat,old.map_lng
  );
  if commerce_changed and new.status='open' and (
    new.departs_at is null or new.ends_at is null or new.ends_at<=new.departs_at
    or new.sales_open_at is null or new.sales_close_at is null or new.sales_open_at>=new.sales_close_at or new.sales_close_at>=new.departs_at
    or new.minimum_guests is null or new.minimum_guests<1 or new.minimum_guests>new.capacity
    or new.seat_price_jpy is null or new.seat_price_jpy<=0 or new.currency<>'JPY' or not new.tax_included
    or length(trim(coalesce(new.meeting_name,'')))<2 or length(trim(coalesce(new.meeting_address,'')))<5
    or new.map_lat is null or new.map_lng is null
  ) then raise exception 'departure product incomplete'; end if;
  return new;
end$$;

update public.departures set
  booking_closes_at=coalesce(booking_closes_at,departs_at-interval '24 hours'),
  chat_opens_at=coalesce(chat_opens_at,(((departs_at at time zone 'Asia/Tokyo')::date-1)+time '12:00') at time zone 'Asia/Tokyo')
where departs_at is not null and (booking_closes_at is null or chat_opens_at is null);

alter table public.departures drop constraint if exists departures_lifecycle_times_check;
alter table public.departures add constraint departures_lifecycle_times_check check(
  departs_at is null or (
    booking_closes_at is not null and booking_closes_at<=departs_at and
    chat_opens_at is not null and chat_opens_at<=departs_at
  )
);

create or replace function public.set_departure_lifecycle_defaults()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.departs_at is not null then
    if new.booking_closes_at is null or (tg_op='UPDATE' and new.departs_at is distinct from old.departs_at and new.booking_closes_at=old.booking_closes_at) then
      new.booking_closes_at:=new.departs_at-interval '24 hours';
    end if;
    if new.chat_opens_at is null or (tg_op='UPDATE' and new.departs_at is distinct from old.departs_at and new.chat_opens_at=old.chat_opens_at) then
      new.chat_opens_at:=(((new.departs_at at time zone 'Asia/Tokyo')::date-1)+time '12:00') at time zone 'Asia/Tokyo';
    end if;
  end if;
  return new;
end$$;
drop trigger if exists departures_lifecycle_defaults on public.departures;
create trigger departures_lifecycle_defaults before insert or update of departs_at on public.departures
for each row execute function public.set_departure_lifecycle_defaults();

create index if not exists departures_cutoff_due_idx
  on public.departures(status,booking_closes_at)
  where status='open';

create table public.departure_operations_alerts(
  id uuid primary key default gen_random_uuid(),
  departure_id uuid not null references public.departures(id) on delete cascade,
  kind text not null check(kind in ('low_booking_count')),
  status text not null default 'pending' check(status in ('pending','acknowledged','resolved')),
  passenger_count integer not null check(passenger_count>=0),
  threshold integer not null default 4 check(threshold>0),
  detail jsonb not null default '{}'::jsonb,
  email_alerted_at timestamptz,
  acknowledged_by uuid references public.profiles(id),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(departure_id,kind)
);
alter table public.departure_operations_alerts enable row level security;
create policy departure_alerts_operations_read on public.departure_operations_alerts
  for select using(public.is_operations());
revoke all on public.departure_operations_alerts from public,anon,authenticated;
grant select(id,departure_id,kind,status,passenger_count,threshold,detail,email_alerted_at,created_at,updated_at)
  on public.departure_operations_alerts to authenticated;
grant all on public.departure_operations_alerts to service_role;

create or replace function public.operations_set_departure_lifecycle(
  p_departure uuid,p_booking_closes_at timestamptz,p_chat_opens_at timestamptz
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_departs timestamptz;
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  select departs_at into v_departs from public.departures where id=p_departure for update;
  if v_departs is null then raise exception 'departure time required'; end if;
  if p_booking_closes_at>v_departs or p_chat_opens_at>v_departs then raise exception 'invalid lifecycle time'; end if;
  update public.departures set booking_closes_at=p_booking_closes_at,chat_opens_at=p_chat_opens_at,updated_at=now() where id=p_departure;
  return found;
end$$;

create or replace function public.process_due_departure_cutoffs(p_now timestamptz default now())
returns table(departure_id uuid,passenger_count integer,result text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare item record; seats integer;
begin
  update public.trip_rooms set status='open' where status='frozen' and opens_at is not null and opens_at<=p_now;
  for item in
    select d.id from public.departures d
    where d.status='open' and d.booking_closes_at is not null and d.booking_closes_at<=p_now
    order by d.booking_closes_at for update skip locked
  loop
    select coalesce(sum(o.seat_count),0)::integer into seats from public.orders o
      where o.departure_id=item.id and o.status in ('paid','confirmed');
    update public.departures set status='closed',
      dispatch_planning_status=case when seats<4 then 'needs_manual_review' else 'ready_for_planning' end,
      updated_at=p_now where id=item.id;
    if seats<4 then
      insert into public.departure_operations_alerts(departure_id,kind,passenger_count,threshold,detail)
      values(item.id,'low_booking_count',seats,4,jsonb_build_object(
        'reason','cutoff_reached_below_review_threshold','automaticCancellation',false,'occurredAt',p_now
      )) on conflict(departure_id,kind) do update set
        passenger_count=excluded.passenger_count,detail=excluded.detail,updated_at=p_now;
      departure_id:=item.id; passenger_count:=seats; result:='needs_manual_review';
    else
      departure_id:=item.id; passenger_count:=seats; result:='ready_for_planning';
    end if;
    return next;
  end loop;
end$$;

create or replace function public.sync_dispatch_planning_status()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_departure uuid;
begin
  select va.departure_id into v_departure from public.vehicle_assignments va where va.id=new.vehicle_assignment_id;
  if v_departure is not null and new.status='draft' then
    update public.departures set dispatch_planning_status='planned',updated_at=now()
      where id=v_departure and dispatch_planning_status in ('ready_for_planning','needs_manual_review');
  end if;
  return new;
end$$;
drop trigger if exists dispatch_tasks_planning_status on public.dispatch_tasks;
create trigger dispatch_tasks_planning_status after insert or update of status on public.dispatch_tasks
for each row execute function public.sync_dispatch_planning_status();

create or replace function public.mark_departure_alert_emailed(p_alert uuid,p_now timestamptz default now())
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.departure_operations_alerts set email_alerted_at=p_now,updated_at=p_now
    where id=p_alert and email_alerted_at is null;
  return found;
end$$;

drop function if exists public.get_operations_dashboard_departures();
create function public.get_operations_dashboard_departures()
returns table(id uuid,trip_title text,departs_at timestamptz,capacity integer,status text,meeting_name text,order_count bigint,booked_seats bigint,pending_orders bigint,gross_amount_jpy bigint,booking_closes_at timestamptz,chat_opens_at timestamptz,dispatch_planning_status text,requires_manual_review boolean)
language sql stable security definer set search_path=public,pg_temp as $$
  select d.id,t.title,d.departs_at,d.capacity,d.status,d.meeting_name,
    count(o.id),coalesce(sum(case when o.status in ('paid','confirmed') then o.seat_count else 0 end),0)::bigint,
    count(o.id) filter(where o.status='pending_payment'),
    coalesce(sum(case when o.status in ('paid','confirmed') and o.currency='JPY' then o.amount else 0 end),0)::bigint,
    d.booking_closes_at,d.chat_opens_at,d.dispatch_planning_status,
    d.dispatch_planning_status='needs_manual_review'
  from public.departures d join public.trips t on t.id=d.trip_id left join public.orders o on o.departure_id=d.id
  where public.is_operations()
  group by d.id,t.title,d.departs_at,d.capacity,d.status,d.meeting_name,d.booking_closes_at,d.chat_opens_at,d.dispatch_planning_status
  order by d.departs_at nulls last limit 30;
$$;

create or replace function public.finalize_dispatch_departure(p_departure uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_task record;v_order record;v_group uuid;v_room_open timestamptz;
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if exists(select 1 from public.dispatch_tasks dt join public.vehicle_assignments va on va.id=dt.vehicle_assignment_id where va.departure_id=p_departure and dt.status='draft') then return false; end if;
  if not exists(select 1 from public.dispatch_tasks dt join public.vehicle_assignments va on va.id=dt.vehicle_assignment_id where va.departure_id=p_departure and dt.status in ('confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress','completed')) then return false; end if;
  select coalesce(d.chat_opens_at,(((d.departs_at at time zone 'Asia/Tokyo')::date-1)+time '12:00') at time zone 'Asia/Tokyo') into v_room_open from public.departures d where d.id=p_departure for update;
  if v_room_open is null then raise exception 'departure time required before fulfilment'; end if;
  for v_task in select dt.id task_id,dt.driver_id,dr.account_id,va.id assignment_id,va.sequence,fv.registration_identifier from public.dispatch_tasks dt join public.vehicle_assignments va on va.id=dt.vehicle_assignment_id join public.driver_resources dr on dr.id=dt.driver_id left join public.fleet_vehicles fv on fv.id=dt.fleet_vehicle_id where va.departure_id=p_departure and dt.status in ('confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress','completed') order by va.sequence
  loop
    update public.vehicle_assignments set vehicle_label=coalesce(v_task.registration_identifier,vehicle_label) where id=v_task.assignment_id;
    insert into public.vehicle_groups(departure_id,vehicle_assignment_id) values(p_departure,v_task.assignment_id) on conflict(vehicle_assignment_id) do update set departure_id=excluded.departure_id returning id into v_group;
    insert into public.trip_rooms(vehicle_group_id,opens_at,status) values(v_group,v_room_open,case when v_room_open<=now() then 'open' else 'frozen' end) on conflict(vehicle_group_id) do update set opens_at=excluded.opens_at,status=case when public.trip_rooms.status='closed' then 'closed' when excluded.opens_at<=now() then 'open' else 'frozen' end;
    if v_task.account_id is not null then insert into public.staff_assignments(vehicle_group_id,staff_id,role) values(v_group,v_task.account_id,'driver') on conflict(vehicle_group_id,staff_id) do update set role='driver'; end if;
  end loop;
  for v_order in select o.id,o.seat_count from public.orders o where o.departure_id=p_departure and o.status in ('paid','confirmed') and not exists(select 1 from public.vehicle_group_orders vgo where vgo.order_id=o.id) order by o.created_at,o.id
  loop
    select vg.id into v_group from public.vehicle_groups vg join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id where vg.departure_id=p_departure and va.capacity-coalesce((select sum(o2.seat_count) from public.vehicle_group_orders vgo2 join public.orders o2 on o2.id=vgo2.order_id where vgo2.vehicle_group_id=vg.id),0)>=v_order.seat_count order by va.sequence limit 1;
    if v_group is null then raise exception 'order cannot fit without splitting: %',v_order.id; end if;
    insert into public.vehicle_group_orders(vehicle_group_id,order_id) values(v_group,v_order.id);
  end loop;
  update public.vehicle_assignments va set booked_seats=coalesce((select sum(o.seat_count) from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id join public.vehicle_groups vg on vg.id=vgo.vehicle_group_id where vg.vehicle_assignment_id=va.id),0) where va.departure_id=p_departure;
  update public.departures set dispatch_planning_status='confirmed',updated_at=now() where id=p_departure;
  return true;
end$$;

drop function if exists public.get_staff_portal_tasks();
create function public.get_staff_portal_tasks()
returns table(
  staff_assignment_id uuid,assignment_role text,vehicle_group_id uuid,room_id uuid,room_status text,
  departure_id uuid,trip_title text,departs_at timestamptz,chat_opens_at timestamptz,
  meeting_name text,meeting_address text,map_lat numeric,map_lng numeric,vehicle_sequence integer,
  vehicle_type text,vehicle_label text,vehicle_capacity integer,booked_seats integer,passenger_count integer,
  boarded_count integer,payment_ready_count integer,payment_review_count integer,payment_blocked_count integer
)
language sql stable security definer set search_path=public,pg_temp as $$
  select sa.id,sa.role::text,vg.id,tr.id,tr.status,d.id,t.title,d.departs_at,d.chat_opens_at,
    d.meeting_name,d.meeting_address,d.map_lat,d.map_lng,va.sequence,va.vehicle_type,
    va.vehicle_label,va.capacity,va.booked_seats,count(distinct p.id)::integer,
    count(distinct p.id) filter(where pc.status='boarded')::integer,
    count(distinct o.id) filter(where o.status in ('paid','confirmed'))::integer,
    count(distinct o.id) filter(where o.status in ('pending_payment','pending_manual_review','payment_review'))::integer,
    count(distinct o.id) filter(where o.status in ('cancelled','refunded','expired'))::integer
  from public.staff_assignments sa join public.vehicle_groups vg on vg.id=sa.vehicle_group_id
  join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id join public.departures d on d.id=vg.departure_id
  join public.trips t on t.id=d.trip_id left join public.trip_rooms tr on tr.vehicle_group_id=vg.id
  left join public.vehicle_group_orders vgo on vgo.vehicle_group_id=vg.id left join public.orders o on o.id=vgo.order_id
  left join public.passengers p on p.order_id=o.id left join public.passenger_checkins pc on pc.passenger_id=p.id
  where sa.staff_id=auth.uid() and sa.role in ('driver','guide','operations')
  group by sa.id,vg.id,tr.id,d.id,t.id,va.id order by d.departs_at nulls last,va.sequence;
$$;

revoke all on function public.operations_set_departure_lifecycle(uuid,timestamptz,timestamptz),public.process_due_departure_cutoffs(timestamptz),public.mark_departure_alert_emailed(uuid,timestamptz),public.get_operations_dashboard_departures(),public.finalize_dispatch_departure(uuid),public.get_staff_portal_tasks() from public,anon;
grant execute on function public.operations_set_departure_lifecycle(uuid,timestamptz,timestamptz),public.get_operations_dashboard_departures(),public.get_staff_portal_tasks() to authenticated;
grant execute on function public.process_due_departure_cutoffs(timestamptz),public.mark_departure_alert_emailed(uuid,timestamptz) to service_role;
revoke all on function public.finalize_dispatch_departure(uuid) from authenticated;

commit;
