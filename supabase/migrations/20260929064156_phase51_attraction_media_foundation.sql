-- Phase 5.1-A: reusable attraction image/video metadata over the existing
-- route-media object bucket. Storage objects remain in Storage; this table is
-- the auditable application catalogue and is never directly writable by users.
create table public.attraction_media_assets (
  id uuid primary key default gen_random_uuid(),
  attraction_id uuid not null references public.attractions(id) on delete restrict,
  media_type text not null check (media_type in ('image','video')),
  storage_bucket text not null default 'route-media' check (storage_bucket='route-media'),
  storage_path text not null unique check (storage_path ~ '^attractions/[0-9a-f-]+/.+'),
  original_filename text not null check (length(original_filename) between 1 and 255),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','video/mp4')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 52428800),
  status text not null default 'active' check (status in ('active','inactive')),
  orientation text not null default 'unknown' check (orientation in ('landscape','portrait','square','unknown')),
  season text not null default 'all-season' check (season in ('all-season','spring','summer','autumn','winter')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index attraction_media_assets_attraction_status_idx on public.attraction_media_assets(attraction_id,status,created_at desc);
alter table public.attraction_media_assets enable row level security;
revoke all on table public.attraction_media_assets from anon,authenticated;

create or replace function public.get_operations_attraction_media(p_slug text)
returns table(id uuid,attraction_id uuid,media_type text,storage_path text,original_filename text,mime_type text,byte_size bigint,status text,orientation text,season text,created_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
  return query select m.id,m.attraction_id,m.media_type,m.storage_path,m.original_filename,m.mime_type,m.byte_size,m.status,m.orientation,m.season,m.created_at,m.updated_at
  from public.attraction_media_assets m join public.attractions a on a.id=m.attraction_id
  where a.slug=p_slug order by m.created_at desc;
end;
$$;

create or replace function public.create_operations_attraction_media(p_slug text,p_media_type text,p_storage_path text,p_original_filename text,p_mime_type text,p_byte_size bigint,p_orientation text,p_season text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare attraction public.attractions%rowtype; media_id uuid;
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
  select * into attraction from public.attractions where slug=p_slug;
  if not found then raise exception 'attraction not found' using errcode='22023'; end if;
  if p_media_type not in ('image','video') or p_orientation not in ('landscape','portrait','square','unknown') or p_season not in ('all-season','spring','summer','autumn','winter') then raise exception 'invalid media metadata' using errcode='22023'; end if;
  if p_storage_path !~ ('^attractions/'||attraction.id::text||'/') then raise exception 'invalid storage path' using errcode='22023'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='route-media' and o.name=p_storage_path) then raise exception 'storage object not found' using errcode='22023'; end if;
  insert into public.attraction_media_assets(attraction_id,media_type,storage_path,original_filename,mime_type,byte_size,orientation,season,created_by)
  values(attraction.id,p_media_type,p_storage_path,p_original_filename,p_mime_type,p_byte_size,p_orientation,p_season,auth.uid()) returning id into media_id;
  return media_id;
end;
$$;

create or replace function public.update_operations_attraction_media(p_media uuid,p_season text,p_status text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
  if p_season not in ('all-season','spring','summer','autumn','winter') or p_status not in ('active','inactive') then raise exception 'invalid media metadata' using errcode='22023'; end if;
  update public.attraction_media_assets set season=p_season,status=p_status,updated_at=now() where id=p_media;
  if not found then raise exception 'media not found' using errcode='22023'; end if;
  return true;
end;
$$;

create or replace function public.get_public_attraction_media(p_slug text)
returns table(id uuid,media_type text,storage_path text,original_filename text,orientation text,season text,created_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select m.id,m.media_type,m.storage_path,m.original_filename,m.orientation,m.season,m.created_at
  from public.attraction_media_assets m join public.attractions a on a.id=m.attraction_id
  where a.slug=p_slug and a.status='published' and m.status='active'
  order by m.created_at desc;
$$;

revoke all on function public.get_operations_attraction_media(text) from public;
revoke all on function public.create_operations_attraction_media(text,text,text,text,text,bigint,text,text) from public;
revoke all on function public.update_operations_attraction_media(uuid,text,text) from public;
revoke all on function public.get_public_attraction_media(text) from public;
grant execute on function public.get_operations_attraction_media(text) to authenticated;
grant execute on function public.create_operations_attraction_media(text,text,text,text,text,bigint,text,text) to authenticated;
grant execute on function public.update_operations_attraction_media(uuid,text,text) to authenticated;
grant execute on function public.get_public_attraction_media(text) to anon,authenticated;
