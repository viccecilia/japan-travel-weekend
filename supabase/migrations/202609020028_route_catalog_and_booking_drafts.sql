begin;

alter table public.trips add column if not exists content jsonb not null default '{}'::jsonb;
alter table public.trips add column if not exists hero_image_url text;
alter table public.trips add column if not exists gallery jsonb not null default '[]'::jsonb;
alter table public.departures add column if not exists ends_at timestamptz;
alter table public.departures add column if not exists arrival_transit text;
alter table public.departures add column if not exists arrival_walking text;
alter table public.departures add column if not exists arrival_driving text;
alter table public.departures add column if not exists meeting_photo_url text;

create table if not exists public.booking_drafts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles(id) on delete cascade,
  departure_id uuid not null references public.departures(id),
  idempotency_key text not null,
  adults integer not null check(adults >= 1 and adults <= 20),
  children integer not null check(children >= 0 and children <= 20),
  infants integer not null check(infants >= 0 and infants <= 20),
  seat_impact integer not null check(seat_impact > 0 and seat_impact <= 40),
  passenger_private jsonb not null,
  assistance_private jsonb not null default '{}'::jsonb,
  assistance_summary jsonb not null default '{}'::jsonb,
  operational_review_status text not null check(operational_review_status in ('not_requested','reviewing','manual_contact','confirmed','unavailable')),
  accepted_cancellation boolean not null default false,
  accepted_terms boolean not null default false,
  status text not null default 'payment_not_started' check(status in ('payment_not_started','pending_manual_review','converted','expired','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id,idempotency_key)
);

alter table public.booking_drafts enable row level security;
revoke all on public.booking_drafts from anon,authenticated;
grant select on public.booking_drafts to authenticated;
grant all on public.booking_drafts to service_role;

drop policy if exists booking_drafts_owner_select on public.booking_drafts;
create policy booking_drafts_owner_select on public.booking_drafts
for select to authenticated using(account_id=auth.uid());

create index if not exists booking_drafts_account_created_idx on public.booking_drafts(account_id,created_at desc);
create index if not exists booking_drafts_departure_status_idx on public.booking_drafts(departure_id,status);

create or replace function public.save_own_booking_draft(
  p_departure uuid,
  p_adults integer,
  p_children integer,
  p_infants integer,
  p_passenger_private jsonb,
  p_assistance_private jsonb,
  p_operational_review_status text,
  p_accepted_cancellation boolean,
  p_accepted_terms boolean,
  p_idempotency_key text
) returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_account uuid := auth.uid();
  v_draft uuid;
  v_seat_impact integer;
  v_summary jsonb;
begin
  if v_account is null then raise exception 'authentication required'; end if;
  if p_adults < 1 or p_children < 0 or p_infants < 0 or p_adults+p_children+p_infants > 40 then raise exception 'invalid passenger composition'; end if;
  if length(coalesce(p_idempotency_key,'')) < 12 then raise exception 'invalid idempotency key'; end if;
  if not coalesce(p_accepted_cancellation,false) or not coalesce(p_accepted_terms,false) then raise exception 'terms not accepted'; end if;
  if not exists(select 1 from public.departures d where d.id=p_departure and d.status='open' and d.departs_at>now()) then raise exception 'departure unavailable'; end if;
  if coalesce(p_passenger_private->>'name','')='' or coalesce(p_passenger_private->>'phone','')='' or coalesce(p_passenger_private->>'emergency','')='' then raise exception 'passenger details incomplete'; end if;
  if p_operational_review_status not in ('not_requested','reviewing','manual_contact','confirmed','unavailable') then raise exception 'invalid review status'; end if;

  v_seat_impact := p_adults+p_children+p_infants;
  v_summary := jsonb_build_object(
    'childSeatCount',coalesce((p_assistance_private#>>'{childSeat,quantity}')::integer,0),
    'childSeatStatus',coalesce(p_assistance_private#>>'{childSeat,status}','未提出'),
    'strollerCount',coalesce((p_assistance_private#>>'{stroller,quantity}')::integer,0),
    'wheelchair',coalesce((p_assistance_private#>>'{wheelchair,needed}')::boolean,false),
    'accessibleVehicle',coalesce((p_assistance_private#>>'{wheelchair,requiresAccessibleVehicle}')::boolean,false),
    'lift',coalesce((p_assistance_private#>>'{wheelchair,requiresLift}')::boolean,false),
    'staffAssistance',coalesce((p_assistance_private#>>'{wheelchair,requiresStaffAssistance}')::boolean,false),
    'largeLuggage',coalesce((p_assistance_private#>>'{other,largeLuggage}')::integer,0),
    'serviceDog',coalesce((p_assistance_private#>>'{other,serviceDog}')::boolean,false)
  );

  insert into public.booking_drafts(account_id,departure_id,idempotency_key,adults,children,infants,seat_impact,passenger_private,assistance_private,assistance_summary,operational_review_status,accepted_cancellation,accepted_terms)
  values(v_account,p_departure,p_idempotency_key,p_adults,p_children,p_infants,v_seat_impact,p_passenger_private,p_assistance_private,v_summary,p_operational_review_status,p_accepted_cancellation,p_accepted_terms)
  on conflict(account_id,idempotency_key) do update set updated_at=public.booking_drafts.updated_at
  returning public.booking_drafts.id into v_draft;

  if not exists(select 1 from public.booking_drafts bd where bd.id=v_draft and bd.departure_id=p_departure and bd.adults=p_adults and bd.children=p_children and bd.infants=p_infants and bd.passenger_private=p_passenger_private and bd.assistance_private=p_assistance_private) then
    raise exception 'idempotency parameter mismatch';
  end if;
  return v_draft;
end;
$$;

create or replace function public.get_operations_booking_drafts()
returns table(draft_id uuid,trip_title text,departs_at timestamptz,seat_impact integer,adults integer,children integer,infants integer,assistance_summary jsonb,operational_review_status text,draft_status text,created_at timestamptz)
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  return query select bd.id,t.title,d.departs_at,bd.seat_impact,bd.adults,bd.children,bd.infants,bd.assistance_summary,bd.operational_review_status,bd.status,bd.created_at
  from public.booking_drafts bd join public.departures d on d.id=bd.departure_id join public.trips t on t.id=d.trip_id
  order by bd.created_at desc;
end;
$$;

create or replace function public.operations_update_route_catalog(p_slug text,p_title text,p_content jsonb,p_hero_image_url text,p_gallery jsonb,p_status text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_trip uuid;
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  if length(trim(coalesce(p_slug,'')))<3 or length(trim(coalesce(p_title,'')))<3 or p_status not in ('draft','published','archived') then raise exception 'invalid route catalog input'; end if;
  insert into public.trips(slug,title,status,content,hero_image_url,gallery) values(trim(p_slug),trim(p_title),p_status,coalesce(p_content,'{}'::jsonb),nullif(trim(coalesce(p_hero_image_url,'')),''),coalesce(p_gallery,'[]'::jsonb))
  on conflict(slug) do update set title=excluded.title,status=excluded.status,content=excluded.content,hero_image_url=excluded.hero_image_url,gallery=excluded.gallery,updated_at=now()
  returning public.trips.id into v_trip;
  return v_trip;
end;
$$;

revoke all on function public.save_own_booking_draft(uuid,integer,integer,integer,jsonb,jsonb,text,boolean,boolean,text) from public;
grant execute on function public.save_own_booking_draft(uuid,integer,integer,integer,jsonb,jsonb,text,boolean,boolean,text) to authenticated,service_role;
revoke all on function public.get_operations_booking_drafts() from public;
grant execute on function public.get_operations_booking_drafts() to authenticated,service_role;
revoke all on function public.operations_update_route_catalog(text,text,jsonb,text,jsonb,text) from public;
grant execute on function public.operations_update_route_catalog(text,text,jsonb,text,jsonb,text) to authenticated,service_role;

drop function if exists public.list_sellable_departures();
create function public.list_sellable_departures()
returns table(id uuid,trip_slug text,trip_title text,departs_at timestamptz,ends_at timestamptz,capacity integer,available_seats integer,seat_price_jpy integer,meeting_name text,meeting_address text,map_lat numeric,map_lng numeric,arrival_transit text,arrival_walking text,arrival_driving text,meeting_photo_url text)
language sql stable security definer set search_path=public,pg_temp
as $$
  select d.id,t.slug,t.title,d.departs_at,d.ends_at,d.capacity,greatest(d.capacity-coalesce(l.used,0),0)::integer,d.seat_price_jpy,d.meeting_name,d.meeting_address,d.map_lat,d.map_lng,d.arrival_transit,d.arrival_walking,d.arrival_driving,d.meeting_photo_url
  from public.departures d join public.trips t on t.id=d.trip_id
  left join lateral(select sum(il.seats)::integer used from public.inventory_locks il where il.departure_id=d.id and (il.status='committed' or (il.status='held' and il.expires_at>now()))) l on true
  where d.status='open' and t.status='published' and d.departs_at is not null and d.seat_price_jpy is not null and d.seat_price_jpy>0
  order by d.departs_at;
$$;
revoke all on function public.list_sellable_departures() from public;
grant execute on function public.list_sellable_departures() to anon,authenticated,service_role;

commit;
