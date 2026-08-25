begin;

create or replace function public.list_sellable_departures()
returns table(
  id uuid,
  trip_slug text,
  trip_title text,
  departs_at timestamptz,
  capacity integer,
  available_seats integer,
  seat_price_jpy integer
)
language sql
stable
security definer
set search_path=public
as $$
  select
    d.id,
    t.slug,
    t.title,
    d.departs_at,
    d.capacity,
    greatest(d.capacity-coalesce(locks.used,0),0)::integer,
    d.seat_price_jpy
  from public.departures d
  join public.trips t on t.id=d.trip_id
  left join lateral (
    select sum(l.seats)::integer as used
    from public.inventory_locks l
    where l.departure_id=d.id
      and (l.status='committed' or (l.status='held' and l.expires_at>now()))
  ) locks on true
  where d.status='open'
    and t.status='published'
    and d.departs_at is not null
    and d.seat_price_jpy is not null
    and d.seat_price_jpy>0
  order by d.departs_at;
$$;

revoke all on function public.list_sellable_departures() from public;
grant execute on function public.list_sellable_departures() to anon,authenticated,service_role;

create or replace function public.get_own_order_fulfilment(p_order uuid)
returns table(
  order_id uuid,
  departure_id uuid,
  departs_at timestamptz,
  meeting_name text,
  meeting_address text,
  map_lat numeric,
  map_lng numeric
)
language sql
stable
security definer
set search_path=public
as $$
  select o.id,d.id,d.departs_at,d.meeting_name,d.meeting_address,d.map_lat,d.map_lng
  from public.orders o
  join public.departures d on d.id=o.departure_id
  where o.id=p_order and o.account_id=auth.uid();
$$;

revoke all on function public.get_own_order_fulfilment(uuid) from public;
grant execute on function public.get_own_order_fulfilment(uuid) to authenticated,service_role;

revoke select on public.departures from anon,authenticated;
grant select(id,trip_id,departs_at,capacity,status,seat_price_jpy) on public.departures to anon,authenticated;

commit;
