begin;

-- Public publication is a business state. Test fixtures may be complete and
-- "published" for staff acceptance, but must never become anonymously visible
-- or sellable merely because they share that lifecycle state.
alter table public.trips
  add column if not exists publication_scope text not null default 'public';
alter table public.trips drop constraint if exists trips_publication_scope_check;
alter table public.trips add constraint trips_publication_scope_check
  check (publication_scope in ('public','internal_test'));

alter table public.departures
  add column if not exists sales_scope text not null default 'public';
alter table public.departures drop constraint if exists departures_sales_scope_check;
alter table public.departures add constraint departures_sales_scope_check
  check (sales_scope in ('public','internal_test'));

-- Preserve records and every order relationship. These rows are quarantined,
-- never deleted or silently cancelled by the migration.
update public.trips
set publication_scope='internal_test',updated_at=now()
where slug ilike 'test-staff-%' or title ilike 'TEST-%';

update public.departures d
set sales_scope='internal_test',updated_at=now()
where d.meeting_name ilike 'TEST-UAT%'
   or exists(select 1 from public.trips t where t.id=d.trip_id and t.publication_scope='internal_test');

drop policy if exists published_trips on public.trips;
create policy published_trips on public.trips for select
using ((status='published' and publication_scope='public') or public.is_operations());

drop policy if exists open_departures on public.departures;
create policy open_departures on public.departures for select
using (
  (status in ('open','closed','completed') and sales_scope='public'
    and exists(select 1 from public.trips t where t.id=trip_id and t.publication_scope='public'))
  or public.is_operations()
);

create or replace function public.list_public_product_catalog()
returns table(id uuid,slug text,title text,content jsonb,hero_image_url text,gallery jsonb,revision_number integer,updated_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select t.id,t.slug,r.title,r.content,r.hero_image_url,r.gallery,r.revision_number,coalesce(r.published_at,r.created_at)
  from public.trips t
  join public.product_revisions r on r.id=t.current_published_revision_id
  where t.status='published' and t.publication_scope='public' and r.state='published'
  order by t.slug
$$;

create or replace function public.is_departure_sellable(p_departure uuid,p_at timestamptz default now())
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.departures d join public.trips t on t.id=d.trip_id
    where d.id=p_departure and d.status='open' and d.sales_scope='public'
      and t.status='published' and t.publication_scope='public'
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

-- Recreate the public projection so every already-upgraded database receives
-- the scope gate even when migration 033/091 was applied in the past.
drop function if exists public.list_sellable_departures();
create function public.list_sellable_departures()
returns table(id uuid,trip_slug text,trip_title text,departs_at timestamptz,ends_at timestamptz,capacity integer,available_seats integer,minimum_guests integer,seat_price_jpy integer,child_price_jpy integer,infant_price_jpy integer,currency text,tax_included boolean,sales_close_at timestamptz,meeting_name text,meeting_address text,map_lat numeric,map_lng numeric,arrival_transit text,arrival_walking text,arrival_driving text,meeting_photo_url text)
language sql stable security definer set search_path=public,pg_temp as $$
  select d.id,t.slug,t.title,d.departs_at,d.ends_at,d.capacity,greatest(d.capacity-coalesce(l.used,0),0)::integer,d.minimum_guests,d.seat_price_jpy,d.child_price_jpy,d.infant_price_jpy,d.currency,d.tax_included,d.sales_close_at,d.meeting_name,d.meeting_address,d.map_lat,d.map_lng,d.arrival_transit,d.arrival_walking,d.arrival_driving,d.meeting_photo_url
  from public.departures d join public.trips t on t.id=d.trip_id
  left join lateral(select sum(il.seats)::integer used from public.inventory_locks il where il.departure_id=d.id and (il.status='committed' or (il.status='held' and il.expires_at>now()))) l on true
  where public.is_departure_sellable(d.id,now()) and greatest(d.capacity-coalesce(l.used,0),0)>0
  order by d.departs_at
$$;

create table if not exists public.release_manifests(
  id uuid primary key default gen_random_uuid(),
  environment text not null check(environment in ('isolated_test','staging','production')),
  frontend_sha text not null check(frontend_sha ~ '^[0-9a-f]{40}$'),
  backend_sha text not null check(backend_sha ~ '^[0-9a-f]{40}$'),
  database_migration text not null,
  deployed_at timestamptz not null default now(),
  recorded_by uuid references public.profiles(id),
  notes text
);
alter table public.release_manifests enable row level security;
revoke all on public.release_manifests from public,anon,authenticated;
grant select on public.release_manifests to authenticated;
grant all on public.release_manifests to service_role;
drop policy if exists release_manifests_operations_read on public.release_manifests;
create policy release_manifests_operations_read on public.release_manifests for select to authenticated
using(public.is_operations());

create or replace function public.get_operations_release_status()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select case when public.is_operations() then jsonb_build_object(
    'requiredDatabaseMigration','202609090099',
    'latestManifest',(select to_jsonb(m) - 'recorded_by' from public.release_manifests m order by m.deployed_at desc limit 1),
    'functionChecksums',jsonb_build_object(
      'list_public_product_catalog',md5(pg_get_functiondef('public.list_public_product_catalog()'::regprocedure)),
      'list_sellable_departures',md5(pg_get_functiondef('public.list_sellable_departures()'::regprocedure)),
      'is_departure_sellable',md5(pg_get_functiondef('public.is_departure_sellable(uuid,timestamp with time zone)'::regprocedure))
    )
  ) else null end
$$;

revoke all on function public.list_public_product_catalog(),public.list_sellable_departures(),public.is_departure_sellable(uuid,timestamptz),public.get_operations_release_status() from public,anon;
grant execute on function public.list_public_product_catalog(),public.list_sellable_departures() to anon,authenticated,service_role;
grant execute on function public.is_departure_sellable(uuid,timestamptz),public.get_operations_release_status() to authenticated,service_role;

commit;
