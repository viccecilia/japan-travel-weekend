begin;

create table if not exists public.fulfilment_work_items(
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  departure_id uuid not null references public.departures(id) on delete cascade,
  kind text not null check(kind in ('paid_order_ready','payment_review')),
  status text not null default 'pending' check(status in ('pending','assigned','completed','cancelled')),
  source_event_id text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(order_id,kind,source_event_id)
);
create table if not exists public.staff_execution_events(
  id uuid primary key default gen_random_uuid(), vehicle_group_id uuid not null references public.vehicle_groups(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  event_type text not null check(event_type in ('task_accepted','meeting_started','delay_reported','incident_reported','support_requested')),
  detail jsonb not null default '{}'::jsonb, idempotency_key text not null, created_at timestamptz not null default now(), unique(actor_id,idempotency_key)
);
alter table public.fulfilment_work_items enable row level security;
alter table public.staff_execution_events enable row level security;
revoke all on public.fulfilment_work_items,public.staff_execution_events from public,anon,authenticated;
grant select on public.fulfilment_work_items,public.staff_execution_events to authenticated;
grant all on public.fulfilment_work_items,public.staff_execution_events to service_role;
create policy fulfilment_work_items_ops_select on public.fulfilment_work_items for select to authenticated using(public.is_operations());
create policy staff_execution_events_scope_select on public.staff_execution_events for select to authenticated using(public.is_operations() or public.is_group_staff(vehicle_group_id));

create or replace function public.record_staff_execution_event(p_vehicle_group uuid,p_event_type text,p_detail jsonb,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_room uuid;v_content text;
begin
  if auth.uid() is null or not(public.is_operations() or public.is_group_staff(p_vehicle_group)) then raise exception 'assigned staff only'; end if;
  if p_event_type not in ('task_accepted','meeting_started','delay_reported','incident_reported','support_requested') or length(trim(p_idempotency_key))<8 then raise exception 'invalid event'; end if;
  if p_event_type in ('delay_reported','incident_reported','support_requested') and length(trim(coalesce(p_detail->>'detail',''))) not between 3 and 800 then raise exception 'detail required'; end if;
  insert into public.staff_execution_events(vehicle_group_id,actor_id,event_type,detail,idempotency_key)
  values(p_vehicle_group,auth.uid(),p_event_type,coalesce(p_detail,'{}'::jsonb),p_idempotency_key)
  on conflict(actor_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into v_id;
  if p_event_type='meeting_started' then
    select id into v_room from public.trip_rooms where vehicle_group_id=p_vehicle_group and status='open';
    if v_room is null then raise exception 'trip room is not open'; end if;
    v_content:='司导已发起集合，请到达集合点后点击“我已到达”。';
    insert into public.trip_room_messages(trip_room_id,author_id,content,important,kind,original_content) values(v_room,auth.uid(),v_content,true,'text',v_content);
  end if;
  return v_id;
end$$;

create or replace function public.apply_payment_event(p_event_id text,p_order uuid,p_status public.payment_status,p_created timestamptz,p_digest text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare latest public.payment_events%rowtype;hold public.inventory_locks%rowtype;v_departure uuid;v_account uuid;v_paid boolean:=false;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if exists(select 1 from public.payment_events where provider_event_id=p_event_id) then return false; end if;
  select * into latest from public.payment_events where order_id=p_order order by event_created_at desc,received_at desc limit 1;
  insert into public.payment_events(provider,provider_event_id,order_id,status,event_created_at,payload_digest) values('stripe',p_event_id,p_order,p_status,p_created,p_digest);
  if latest.id is not null and p_created<latest.event_created_at then return true; end if;
  select * into hold from public.inventory_locks where order_id=p_order for update;
  select departure_id,account_id into v_departure,v_account from public.orders where id=p_order for update;
  if p_status='succeeded' then
    if hold.status='held' and hold.expires_at>now() then
      update public.inventory_locks set status='committed' where id=hold.id;
      update public.orders set status='paid',payment_review_reason=null,updated_at=now() where id=p_order and status='pending_payment'; v_paid:=found;
    else
      update public.orders set status='payment_review',payment_review_reason='payment_succeeded_without_valid_inventory',updated_at=now() where id=p_order and status in ('pending_payment','expired','cancelled');
      insert into public.fulfilment_work_items(order_id,departure_id,kind,status,source_event_id) values(p_order,v_departure,'payment_review','pending',p_event_id) on conflict do nothing;
    end if;
    if v_paid then
      insert into public.fulfilment_work_items(order_id,departure_id,kind,status,source_event_id) values(p_order,v_departure,'paid_order_ready','pending',p_event_id) on conflict do nothing;
      insert into public.notification_outbox(event_id,event_type,recipient_id,order_id,necessary,payload,status)
      values('stripe:'||p_event_id||':confirmed','order-confirmed',v_account,p_order,true,jsonb_build_object('departureId',v_departure),'pending') on conflict(event_id) do nothing;
    end if;
  elsif p_status='refunded' then
    update public.orders set status='refunded',updated_at=now() where id=p_order and status in ('paid','confirmed','payment_review');
    update public.fulfilment_work_items set status='cancelled',updated_at=now() where order_id=p_order and status in ('pending','assigned');
  end if;
  return true;
end$$;
revoke all on function public.record_staff_execution_event(uuid,text,jsonb,text) from public,anon;
grant execute on function public.record_staff_execution_event(uuid,text,jsonb,text) to authenticated,service_role;
revoke all on function public.apply_payment_event(text,uuid,public.payment_status,timestamptz,text) from public,anon,authenticated;
grant execute on function public.apply_payment_event(text,uuid,public.payment_status,timestamptz,text) to service_role;
commit;
