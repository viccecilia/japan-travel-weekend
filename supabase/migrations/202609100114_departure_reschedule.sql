begin;

alter table public.notification_outbox drop constraint if exists notification_outbox_event_type_check;
alter table public.notification_outbox add constraint notification_outbox_event_type_check check(event_type in (
  'order-confirmed','bank-transfer-pending','meeting-updated','trip-room-opened','departure-reminder','departure-delayed','boarding-completed','checkin-reminder','passenger-contact-escalation','meeting-started','trip-progress','trip-completed','free-time-started','refund-completed','departure-rescheduled'
));

create table if not exists public.departure_change_audit(
  id uuid primary key default gen_random_uuid(),departure_id uuid not null references public.departures(id) on delete restrict,
  actor_id uuid not null references public.profiles(id),from_version integer not null,to_version integer not null,
  prior_values jsonb not null,new_values jsonb not null,affected_paid_orders integer not null default 0,created_at timestamptz not null default now()
);
alter table public.departure_change_audit enable row level security;
revoke all on public.departure_change_audit from public,anon,authenticated;
grant select on public.departure_change_audit to authenticated;grant all on public.departure_change_audit to service_role;
create policy departure_change_audit_ops on public.departure_change_audit for select to authenticated using(public.is_operations());

drop function if exists public.get_operations_editable_departures(timestamptz,timestamptz);
create function public.get_operations_editable_departures(p_from timestamptz default now()-interval '1 day',p_to timestamptz default now()+interval '365 days')
returns table(id uuid,trip_title text,departs_at timestamptz,ends_at timestamptz,seat_price_jpy integer,capacity integer,sales_open_at timestamptz,sales_close_at timestamptz,status text,schedule_version integer,committed_seats bigint,meeting_name text,meeting_address text,map_lat numeric,map_lng numeric,paid_orders bigint)
language sql stable security definer set search_path=public,pg_temp as $$
 select d.id,t.title,d.departs_at,d.ends_at,d.seat_price_jpy,d.capacity,d.sales_open_at,d.sales_close_at,d.status,d.schedule_version,
 coalesce(inv.committed_seats,0),d.meeting_name,d.meeting_address,d.map_lat,d.map_lng,coalesce(ord.paid_orders,0)
 from public.departures d join public.trips t on t.id=d.trip_id
 left join lateral(select coalesce(sum(l.seats),0)::bigint committed_seats from public.inventory_locks l where l.departure_id=d.id and(l.status='committed' or(l.status='held' and l.expires_at>now()))) inv on true
 left join lateral(select count(*)::bigint paid_orders from public.orders o where o.departure_id=d.id and o.status in('paid','confirmed')) ord on true
 where public.is_operations() and d.departs_at between p_from and p_to order by d.departs_at
$$;

create or replace function public.operations_update_departure_v2(p_departure uuid,p_expected_version integer,p_departs_at timestamptz,p_ends_at timestamptz,p_price integer,p_capacity integer,p_sales_open timestamptz,p_sales_close timestamptz,p_status text,p_meeting_name text,p_meeting_address text,p_map_lat numeric,p_map_lng numeric)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.departures%rowtype;committed integer;affected integer;changed boolean;
begin
 if not public.is_operations() then raise exception 'operations role required';end if;
 select * into item from public.departures where id=p_departure for update;
 if not found or item.schedule_version<>p_expected_version then raise exception 'departure version conflict';end if;
 select coalesce(sum(seats),0)::integer into committed from public.inventory_locks where departure_id=item.id and(status='committed' or(status='held' and expires_at>now()));
 select count(*)::integer into affected from public.orders where departure_id=item.id and status in('paid','confirmed');
 if p_capacity<committed or p_price<1 or p_ends_at<=p_departs_at or p_sales_open>=p_sales_close or p_sales_close>=p_departs_at or p_status not in('draft','open','closed','cancelled') or length(trim(coalesce(p_meeting_name,'')))<2 or length(trim(coalesce(p_meeting_address,'')))<5 or p_map_lat not between -90 and 90 or p_map_lng not between -180 and 180 then raise exception 'invalid departure update';end if;
 changed:=item.departs_at is distinct from p_departs_at or item.ends_at is distinct from p_ends_at or item.meeting_name is distinct from trim(p_meeting_name) or item.meeting_address is distinct from trim(p_meeting_address) or item.map_lat is distinct from p_map_lat or item.map_lng is distinct from p_map_lng;
 update public.departures set departs_at=p_departs_at,ends_at=p_ends_at,seat_price_jpy=p_price,capacity=p_capacity,sales_open_at=p_sales_open,sales_close_at=p_sales_close,booking_closes_at=p_sales_close,status=p_status,meeting_name=trim(p_meeting_name),meeting_address=trim(p_meeting_address),map_lat=p_map_lat,map_lng=p_map_lng,schedule_version=schedule_version+1,updated_at=now() where id=item.id;
 insert into public.departure_change_audit(departure_id,actor_id,from_version,to_version,prior_values,new_values,affected_paid_orders) values(item.id,auth.uid(),item.schedule_version,item.schedule_version+1,to_jsonb(item),jsonb_build_object('departsAt',p_departs_at,'endsAt',p_ends_at,'price',p_price,'capacity',p_capacity,'salesOpenAt',p_sales_open,'salesCloseAt',p_sales_close,'status',p_status,'meetingName',trim(p_meeting_name),'meetingAddress',trim(p_meeting_address),'mapLat',p_map_lat,'mapLng',p_map_lng),affected);
 if changed and affected>0 then
  insert into public.notification_outbox(event_id,event_type,recipient_id,order_id,necessary,payload,status)
  select 'departure-rescheduled:'||item.id::text||':'||(item.schedule_version+1)::text||':'||o.id::text,'departure-rescheduled',o.account_id,o.id,true,jsonb_build_object('departureId',item.id,'priorDepartureAt',item.departs_at,'newDepartureAt',p_departs_at,'meetingName',trim(p_meeting_name),'meetingAddress',trim(p_meeting_address),'contractSnapshotUnchanged',true),'pending' from public.orders o where o.departure_id=item.id and o.status in('paid','confirmed') on conflict(event_id) do nothing;
 end if;
 return jsonb_build_object('newVersion',item.schedule_version+1,'affectedPaidOrders',affected,'notificationRequired',changed and affected>0);
end$$;

revoke all on function public.get_operations_editable_departures(timestamptz,timestamptz),public.operations_update_departure_v2(uuid,integer,timestamptz,timestamptz,integer,integer,timestamptz,timestamptz,text,text,text,numeric,numeric) from public,anon;
grant execute on function public.get_operations_editable_departures(timestamptz,timestamptz),public.operations_update_departure_v2(uuid,integer,timestamptz,timestamptz,integer,integer,timestamptz,timestamptz,text,text,text,numeric,numeric) to authenticated,service_role;
commit;
