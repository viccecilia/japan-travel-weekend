begin;

alter table public.departures add column if not exists sales_open_at timestamptz;
alter table public.departures add column if not exists sales_close_at timestamptz;
alter table public.departures add column if not exists minimum_guests integer;
alter table public.departures add column if not exists currency text not null default 'JPY';
alter table public.departures add column if not exists tax_included boolean not null default true;
alter table public.departures add column if not exists child_price_jpy integer;
alter table public.departures add column if not exists infant_price_jpy integer;

alter table public.departures drop constraint if exists departures_sales_window_check;
alter table public.departures add constraint departures_sales_window_check check(sales_open_at is null or sales_close_at is null or sales_open_at<sales_close_at);
alter table public.departures drop constraint if exists departures_minimum_guests_check;
alter table public.departures add constraint departures_minimum_guests_check check(minimum_guests is null or minimum_guests between 1 and capacity);
alter table public.departures drop constraint if exists departures_currency_check;
alter table public.departures add constraint departures_currency_check check(currency='JPY');

create or replace function public.route_catalog_complete(p_content jsonb)
returns boolean language sql immutable set search_path=public,pg_temp as $$
  select jsonb_typeof(coalesce(p_content->'itinerary','null'::jsonb))='array'
    and jsonb_array_length(p_content->'itinerary')>0
    and jsonb_typeof(coalesce(p_content->'included','null'::jsonb))='array'
    and jsonb_array_length(p_content->'included')>0
    and jsonb_typeof(coalesce(p_content->'excluded','null'::jsonb))='array'
    and length(trim(coalesce(p_content->>'description','')))>=20
    and length(trim(coalesce(p_content->>'childPolicy','')))>=10
    and length(trim(coalesce(p_content->>'luggagePolicy','')))>=10
    and length(trim(coalesce(p_content->>'accessibilityInfo','')))>=10
    and length(trim(coalesce(p_content->>'mealInfo','')))>=10
    and length(trim(coalesce(p_content->>'weatherPolicy','')))>=10
    and length(trim(coalesce(p_content->>'cancellationPolicyVersion','')))>=3
$$;

create or replace function public.is_departure_sellable(p_departure uuid,p_at timestamptz default now())
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.departures d join public.trips t on t.id=d.trip_id
    where d.id=p_departure and d.status='open' and t.status='published'
      and public.route_catalog_complete(t.content)
      and d.departs_at>p_at and d.ends_at>d.departs_at
      and d.sales_open_at<=p_at and d.sales_close_at>p_at and d.sales_close_at<d.departs_at
      and d.capacity>0 and d.minimum_guests between 1 and d.capacity
      and d.seat_price_jpy>0 and d.currency='JPY' and d.tax_included
      and length(trim(coalesce(d.meeting_name,'')))>=2
      and length(trim(coalesce(d.meeting_address,'')))>=5
      and d.map_lat between -90 and 90 and d.map_lng between -180 and 180
  )
$$;

create or replace function public.guard_sellable_departure()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.status='open' and (
    new.departs_at is null or new.ends_at is null or new.ends_at<=new.departs_at
    or new.sales_open_at is null or new.sales_close_at is null or new.sales_open_at>=new.sales_close_at or new.sales_close_at>=new.departs_at
    or new.minimum_guests is null or new.minimum_guests<1 or new.minimum_guests>new.capacity
    or new.seat_price_jpy is null or new.seat_price_jpy<=0 or new.currency<>'JPY' or not new.tax_included
    or length(trim(coalesce(new.meeting_name,'')))<2 or length(trim(coalesce(new.meeting_address,'')))<5
    or new.map_lat is null or new.map_lng is null
  ) then raise exception 'departure product incomplete'; end if;
  return new;
end;
$$;
drop trigger if exists guard_sellable_departure_trigger on public.departures;
create trigger guard_sellable_departure_trigger before insert or update on public.departures for each row execute function public.guard_sellable_departure();

create or replace function public.guard_published_trip()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.status='published' and not public.route_catalog_complete(new.content) then raise exception 'route catalog incomplete'; end if;
  return new;
end;
$$;
drop trigger if exists guard_published_trip_trigger on public.trips;
create trigger guard_published_trip_trigger before insert or update on public.trips for each row execute function public.guard_published_trip();

create or replace function public.guard_booking_draft_sellable()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if not public.is_departure_sellable(new.departure_id,now()) then raise exception 'departure product is not sellable'; end if;
  return new;
end;
$$;
drop trigger if exists guard_booking_draft_sellable_trigger on public.booking_drafts;
create trigger guard_booking_draft_sellable_trigger before insert on public.booking_drafts for each row execute function public.guard_booking_draft_sellable();

drop function if exists public.list_sellable_departures();
create function public.list_sellable_departures()
returns table(id uuid,trip_slug text,trip_title text,departs_at timestamptz,ends_at timestamptz,capacity integer,available_seats integer,minimum_guests integer,seat_price_jpy integer,child_price_jpy integer,infant_price_jpy integer,currency text,tax_included boolean,sales_close_at timestamptz,meeting_name text,meeting_address text,map_lat numeric,map_lng numeric,arrival_transit text,arrival_walking text,arrival_driving text,meeting_photo_url text)
language sql stable security definer set search_path=public,pg_temp as $$
  select d.id,t.slug,t.title,d.departs_at,d.ends_at,d.capacity,greatest(d.capacity-coalesce(l.used,0),0)::integer,d.minimum_guests,d.seat_price_jpy,d.child_price_jpy,d.infant_price_jpy,d.currency,d.tax_included,d.sales_close_at,d.meeting_name,d.meeting_address,d.map_lat,d.map_lng,d.arrival_transit,d.arrival_walking,d.arrival_driving,d.meeting_photo_url
  from public.departures d join public.trips t on t.id=d.trip_id
  left join lateral(select sum(il.seats)::integer used from public.inventory_locks il where il.departure_id=d.id and (il.status='committed' or (il.status='held' and il.expires_at>now()))) l on true
  where public.is_departure_sellable(d.id,now()) and greatest(d.capacity-coalesce(l.used,0),0)>0
  order by d.departs_at;
$$;

revoke all on function public.route_catalog_complete(jsonb),public.is_departure_sellable(uuid,timestamptz),public.list_sellable_departures() from public;
grant execute on function public.list_sellable_departures() to anon,authenticated,service_role;
grant execute on function public.is_departure_sellable(uuid,timestamptz) to authenticated,service_role;

commit;
