begin;

drop function if exists public.get_operations_dashboard_departures();
drop function if exists public.get_operations_dashboard_departures(date,date);
create function public.get_operations_dashboard_departures(
  p_from date default ((now() at time zone 'Asia/Tokyo')::date-30),
  p_to date default ((now() at time zone 'Asia/Tokyo')::date+365)
)
returns table(id uuid,trip_title text,departs_at timestamptz,capacity integer,status text,meeting_name text,order_count bigint,booked_seats bigint,pending_orders bigint,gross_amount_jpy bigint,booking_closes_at timestamptz,chat_opens_at timestamptz,dispatch_planning_status text,requires_manual_review boolean)
language sql stable security definer set search_path=public,pg_temp as $$
  select d.id,t.title,d.departs_at,d.capacity,d.status,d.meeting_name,
    count(o.id),coalesce(sum(case when o.status in('paid','confirmed') then o.seat_count else 0 end),0)::bigint,
    count(o.id) filter(where o.status='pending_payment'),
    coalesce(sum(case when o.status in('paid','confirmed') and o.currency='JPY' then o.amount else 0 end),0)::bigint,
    d.booking_closes_at,d.chat_opens_at,d.dispatch_planning_status,d.dispatch_planning_status='needs_manual_review'
  from public.departures d join public.trips t on t.id=d.trip_id left join public.orders o on o.departure_id=d.id
  where public.is_operations()
    and (d.departs_at at time zone 'Asia/Tokyo')::date between p_from and p_to
  group by d.id,t.title,d.departs_at,d.capacity,d.status,d.meeting_name,d.booking_closes_at,d.chat_opens_at,d.dispatch_planning_status
  order by d.departs_at nulls last
$$;

create or replace function public.get_operations_payment_metrics(p_service_date date)
returns table(paid_orders bigint,paid_amount_jpy bigint)
language sql stable security definer set search_path=public,pg_temp as $$
  select count(*)::bigint,coalesce(sum(o.amount) filter(where o.currency='JPY'),0)::bigint
  from public.orders o
  where public.is_operations() and exists(
    select 1 from public.payment_events pe where pe.order_id=o.id and pe.status='succeeded'
      and (pe.event_created_at at time zone 'Asia/Tokyo')::date=p_service_date
  )
$$;

create or replace function public.get_operations_system_release_info()
returns table(migration_version text,database_time timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select '202609110125',now() where public.is_operations()
$$;

revoke all on function public.get_operations_dashboard_departures(date,date) from public,anon;
revoke all on function public.get_operations_payment_metrics(date) from public,anon;
revoke all on function public.get_operations_system_release_info() from public,anon;
grant execute on function public.get_operations_dashboard_departures(date,date) to authenticated,service_role;
grant execute on function public.get_operations_payment_metrics(date) to authenticated,service_role;
grant execute on function public.get_operations_system_release_info() to authenticated,service_role;

commit;
