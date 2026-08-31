begin;

create or replace function public.get_operations_dashboard_departures()
returns table(id uuid,trip_title text,departs_at timestamptz,capacity integer,status text,meeting_name text,order_count bigint,booked_seats bigint,pending_orders bigint,gross_amount_jpy bigint)
language sql stable security definer set search_path=public,pg_temp as $$
  select d.id,t.title,d.departs_at,d.capacity,d.status,d.meeting_name,
    count(o.id),
    coalesce(sum(case when o.status in ('paid','confirmed') then o.seat_count else 0 end),0)::bigint,
    count(o.id) filter(where o.status='pending_payment'),
    coalesce(sum(case when o.status in ('paid','confirmed') and o.currency='JPY' then o.amount else 0 end),0)::bigint
  from public.departures d join public.trips t on t.id=d.trip_id left join public.orders o on o.departure_id=d.id
  where public.is_operations()
  group by d.id,t.title,d.departs_at,d.capacity,d.status,d.meeting_name
  order by d.departs_at nulls last
  limit 30;
$$;

revoke all on function public.get_operations_dashboard_departures() from public,anon;
grant execute on function public.get_operations_dashboard_departures() to authenticated,service_role;

commit;
