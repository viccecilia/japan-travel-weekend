-- Phase 3.5: reusable public attraction guides. Route JSON stores only a slug
-- reference; localized guide text and audio assets are never copied into routes.
create table if not exists public.attractions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  catalog_version integer not null default 1 check (catalog_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.attraction_guides (
  attraction_id uuid not null references public.attractions(id) on delete cascade,
  locale text not null check (locale in ('zh-CN','ja','en','ko','vi','ne','es')),
  title text not null default '',
  body text not null default '',
  updated_at timestamptz not null default now(),
  primary key (attraction_id,locale)
);
create table if not exists public.attraction_audio_assets (
  attraction_id uuid not null references public.attractions(id) on delete cascade,
  locale text not null check (locale in ('zh-CN','ja','en','ko','vi','ne','es')),
  storage_path text,
  audio_url text,
  voice text,
  status text not null default 'pending' check (status in ('pending','uploaded','published')),
  updated_at timestamptz not null default now(),
  primary key (attraction_id,locale),
  check (audio_url is null or audio_url like 'https://%')
);
alter table public.attractions enable row level security;
alter table public.attraction_guides enable row level security;
alter table public.attraction_audio_assets enable row level security;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('attraction-guide-audio','attraction-guide-audio',true,31457280,array['audio/mpeg','audio/mp4','audio/aac','audio/ogg'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists attraction_guide_audio_operations_write on storage.objects;
create policy attraction_guide_audio_operations_write on storage.objects for all to authenticated
  using (bucket_id='attraction-guide-audio' and coalesce(public.is_operations(),false))
  with check (bucket_id='attraction-guide-audio' and coalesce(public.is_operations(),false));

create or replace function public.get_public_attraction_guide(p_slug text,p_locale text)
returns table(id uuid,slug text,locale text,title text,body text,audio_url text,audio_status text,audio_voice text)
language sql stable security definer set search_path=public,pg_temp as $$
  select a.id,a.slug,g.locale,g.title,g.body,aa.audio_url,aa.status,aa.voice
  from public.attractions a
  join public.attraction_guides g on g.attraction_id=a.id
  left join public.attraction_audio_assets aa on aa.attraction_id=a.id and aa.locale=g.locale and aa.status='published'
  where a.slug=p_slug and a.status='published' and g.locale=p_locale and length(trim(g.title))>0 and length(trim(g.body))>0;
$$;

create or replace function public.get_operations_attractions()
returns table(id uuid,slug text,status text,catalog_version integer,text_complete integer,audio_complete integer,route_references text[])
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
  return query
  select a.id,a.slug,a.status,a.catalog_version,
    count(distinct g.locale) filter(where length(trim(g.title))>0 and length(trim(g.body))>0)::integer,
    count(distinct aa.locale) filter(where aa.status='published' and aa.audio_url is not null)::integer,
    coalesce(array_agg(distinct t.slug) filter(where t.slug is not null),array[]::text[])
  from public.attractions a
  left join public.attraction_guides g on g.attraction_id=a.id
  left join public.attraction_audio_assets aa on aa.attraction_id=a.id
  left join public.trips t on exists(
    select 1
    from jsonb_array_elements(coalesce((coalesce(
      (select d.content from public.product_revisions d where d.id=t.current_draft_revision_id),
      (select p.content from public.product_revisions p where p.id=t.current_published_revision_id),
      t.content
    )->'itinerary'),'[]'::jsonb)) stop
    where stop->>'attractionId'=a.slug
  )
  group by a.id,a.slug,a.status,a.catalog_version
  order by a.slug;
end;
$$;

create or replace function public.get_operations_attraction(p_slug text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
  select jsonb_build_object('id',a.id,'slug',a.slug,'status',a.status,'catalog_version',a.catalog_version,
    'guides',coalesce((select jsonb_object_agg(g.locale,jsonb_build_object('title',g.title,'body',g.body)) from public.attraction_guides g where g.attraction_id=a.id),'{}'::jsonb),
    'audio',coalesce((select jsonb_object_agg(aa.locale,jsonb_build_object('storagePath',aa.storage_path,'audioUrl',aa.audio_url,'voice',aa.voice,'status',aa.status)) from public.attraction_audio_assets aa where aa.attraction_id=a.id),'{}'::jsonb)) into result
  from public.attractions a where a.slug=p_slug;
  return result;
end;
$$;

create or replace function public.save_operations_attraction(p_slug text,p_expected_version integer,p_status text,p_guides jsonb,p_audio jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare attraction public.attractions%rowtype; item record; incoming_title text; incoming_body text; incoming_audio jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'invalid attraction slug'; end if;
  if p_status not in ('draft','published','archived') then raise exception 'invalid attraction status'; end if;
  select * into attraction from public.attractions where slug=p_slug for update;
  if found and attraction.catalog_version<>p_expected_version then raise exception 'version conflict' using errcode='40001'; end if;
  if not found then
    if p_expected_version<>0 then raise exception 'version conflict' using errcode='40001'; end if;
    insert into public.attractions(slug,status) values(p_slug,p_status) returning * into attraction;
  else
    update public.attractions set status=p_status,catalog_version=catalog_version+1,updated_at=now() where id=attraction.id returning * into attraction;
  end if;
  for item in select unnest(array['zh-CN','ja','en','ko','vi','ne','es']) as locale loop
    incoming_title:=coalesce(p_guides->item.locale->>'title',''); incoming_body:=coalesce(p_guides->item.locale->>'body','');
    insert into public.attraction_guides(attraction_id,locale,title,body) values(attraction.id,item.locale,incoming_title,incoming_body)
      on conflict(attraction_id,locale) do update set title=excluded.title,body=excluded.body,updated_at=now();
    incoming_audio:=p_audio->item.locale;
    if incoming_audio is not null then
      insert into public.attraction_audio_assets(attraction_id,locale,storage_path,audio_url,voice,status)
      values(attraction.id,item.locale,nullif(incoming_audio->>'storagePath',''),nullif(incoming_audio->>'audioUrl',''),nullif(incoming_audio->>'voice',''),coalesce(nullif(incoming_audio->>'status',''),'pending'))
      on conflict(attraction_id,locale) do update set storage_path=excluded.storage_path,audio_url=excluded.audio_url,voice=excluded.voice,status=excluded.status,updated_at=now();
    end if;
  end loop;
  if p_status='published' and exists(select 1 from unnest(array['zh-CN','ja','en','ko','vi','ne','es']) l where not exists(select 1 from public.attraction_guides g where g.attraction_id=attraction.id and g.locale=l and length(trim(g.title))>0 and length(trim(g.body))>0)) then
    raise exception 'all 7 localized guide texts are required before publication' using errcode='23514';
  end if;
  return jsonb_build_object('id',attraction.id,'slug',attraction.slug,'version',attraction.catalog_version,'status',attraction.status);
end;
$$;

revoke all on function public.get_operations_attractions() from public;
revoke all on function public.get_operations_attraction(text) from public;
revoke all on function public.save_operations_attraction(text,integer,text,jsonb,jsonb) from public;
grant execute on function public.get_public_attraction_guide(text,text) to anon,authenticated;
grant execute on function public.get_operations_attractions() to authenticated;
grant execute on function public.get_operations_attraction(text) to authenticated;
grant execute on function public.save_operations_attraction(text,integer,text,jsonb,jsonb) to authenticated;
