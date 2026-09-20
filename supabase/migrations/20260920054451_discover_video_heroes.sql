-- Independent of product_merchandising: Soul content has no product relation.
-- Public video content only; no transaction fields or role changes.
create table public.discover_heroes (
 id uuid primary key default gen_random_uuid(),
 video_url text not null check(video_url ~ '^(https://|/media/discover/)' and length(video_url)<2048),
 poster_url text not null check(poster_url ~ '^(https://|/media/discover/)' and length(poster_url)<2048),
 product_id uuid references public.trips(id) on delete restrict,
 translations jsonb not null default '{}'::jsonb check(jsonb_typeof(translations)='object'),
 enabled boolean not null default false,
 sort_order integer not null default 0 check(sort_order between 0 and 9999),
 version integer not null default 1 check(version>0),
 history jsonb not null default '[]'::jsonb,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
alter table public.discover_heroes enable row level security;
revoke all on public.discover_heroes from public,anon,authenticated;
grant select on public.discover_heroes to authenticated;
create policy discover_operations_read on public.discover_heroes for select to authenticated
 using(auth.uid() is not null and coalesce(public.is_operations(),false));

-- Deliberate public read RPC, returning only enabled content for published products.
create function public.get_public_discover_heroes() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'video_url',h.video_url,'poster_url',h.poster_url,
 'product_id',h.product_id,'product_slug',t.slug,'translations',h.translations,'enabled',h.enabled,
 'sort_order',h.sort_order,'version',h.version) order by h.sort_order,h.id),'[]'::jsonb)
 from public.discover_heroes h left join public.trips t on t.id=h.product_id
 where h.enabled and (h.product_id is null or t.status='published');
$$;
revoke all on function public.get_public_discover_heroes() from public;
grant execute on function public.get_public_discover_heroes() to anon,authenticated;

create function public.get_operations_discover_heroes() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(h)||jsonb_build_object('product_slug',t.slug) order by h.sort_order,h.id),'[]'::jsonb)
 from public.discover_heroes h left join public.trips t on t.id=h.product_id);
end;
$$;
revoke all on function public.get_operations_discover_heroes() from public,anon;
grant execute on function public.get_operations_discover_heroes() to authenticated;

create function public.save_discover_hero(p_id uuid,p_expected_version integer,p_content jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare previous public.discover_heroes; saved public.discover_heroes; lang record; product uuid; result jsonb;
begin
 if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
 if p_id is null or p_expected_version is null or p_expected_version<0 then raise exception 'invalid version'; end if;
 -- Serialize create/retry for a client-generated stable id; stale retries cannot duplicate.
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into previous from public.discover_heroes where id=p_id for update;
 if (previous.id is null and p_expected_version<>0) or (previous.id is not null and previous.version<>p_expected_version) then
   raise exception 'Discover version conflict; reload before saving' using errcode='40001';
 end if;
 if jsonb_typeof(p_content)<>'object' or exists(select 1 from jsonb_object_keys(p_content) k where k not in('video_url','poster_url','product_id','translations','enabled','sort_order')) then raise exception 'unsupported content field'; end if;
 if jsonb_typeof(p_content->'translations') is distinct from 'object' then raise exception 'invalid translations'; end if;
 for lang in select key,value from jsonb_each(p_content->'translations') loop
   if lang.key not in('zh-CN','zh-TW','ja','ko','en','es','vi','ne') or jsonb_typeof(lang.value)<>'object' then raise exception 'unsupported locale'; end if;
   if exists(select 1 from jsonb_object_keys(lang.value) k where k not in('title','subtitle')) then raise exception 'unsupported translation field'; end if;
   if jsonb_typeof(lang.value->'title') is distinct from 'string' or jsonb_typeof(lang.value->'subtitle') is distinct from 'string'
     or length(lang.value->>'title')>240 or length(lang.value->>'subtitle')>500 then raise exception 'invalid translation text'; end if;
 end loop;
 product:=nullif(p_content->>'product_id','')::uuid;
 if product is not null and not exists(select 1 from public.trips where id=product) then raise exception 'product not found'; end if;
 insert into public.discover_heroes(id,video_url,poster_url,product_id,translations,enabled,sort_order,version,updated_by)
 values(p_id,p_content->>'video_url',p_content->>'poster_url',product,p_content->'translations',(p_content->>'enabled')::boolean,(p_content->>'sort_order')::integer,1,auth.uid())
 on conflict(id) do update set video_url=excluded.video_url,poster_url=excluded.poster_url,product_id=excluded.product_id,
 translations=excluded.translations,enabled=excluded.enabled,sort_order=excluded.sort_order,version=discover_heroes.version+1,updated_at=now(),updated_by=auth.uid()
 returning * into saved;
 -- Keep this content audit self-contained; do not widen account/finance audit rules.
 update public.discover_heroes set history=history||jsonb_build_array(jsonb_build_object(
   'actor',auth.uid(),'at',now(),'version',saved.version,'before',to_jsonb(previous)-'history','after',to_jsonb(saved)-'history'))
 where id=p_id;
 result:=to_jsonb(saved)||jsonb_build_object('product_slug',(select slug from public.trips where id=saved.product_id));
 return result;
end;
$$;
revoke all on function public.save_discover_hero(uuid,integer,jsonb) from public,anon;
grant execute on function public.save_discover_hero(uuid,integer,jsonb) to authenticated;

insert into public.discover_heroes(id,video_url,poster_url,translations,enabled,sort_order)
values('ca631d49-42ee-4c6c-9630-09275e838001','/media/discover/autumn-soul.mp4','/media/discover/autumn-soul.jpg',
jsonb_build_object('zh-CN',jsonb_build_object('title',E'这一生，\n总要看一次京都的秋天。','subtitle','这个秋天，别只在照片里见过京都。')),true,0);
insert into public.discover_heroes(id,video_url,poster_url,product_id,enabled,sort_order)
select 'ca631d49-42ee-4c6c-9630-09275e838002','/media/discover/amanohashidate-ine.mp4','/media/discover/amanohashidate-ine.jpg',id,true,1 from public.trips where slug='amanohashidate-ine';
insert into public.discover_heroes(id,video_url,poster_url,product_id,enabled,sort_order)
select 'ca631d49-42ee-4c6c-9630-09275e838003','/media/discover/katsuoji-arashiyama.mp4','/media/discover/katsuoji-arashiyama.jpg',id,true,2 from public.trips where slug='miyama-katsuoji-arashiyama';
