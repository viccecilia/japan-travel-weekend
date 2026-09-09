begin;

create table if not exists public.product_revisions(
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete restrict,
  revision_number integer not null check(revision_number>0),
  state text not null check(state in ('draft','published','superseded')),
  title text not null,
  content jsonb not null default '{}'::jsonb,
  hero_image_url text,
  gallery jsonb not null default '[]'::jsonb check(jsonb_typeof(gallery)='array'),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique(trip_id,revision_number)
);
alter table public.trips add column if not exists current_published_revision_id uuid references public.product_revisions(id);
alter table public.trips add column if not exists current_draft_revision_id uuid references public.product_revisions(id);
alter table public.product_revisions enable row level security;
revoke all on public.product_revisions from public,anon,authenticated;
grant select on public.product_revisions to authenticated;
grant all on public.product_revisions to service_role;
create policy product_revision_operations_read on public.product_revisions for select to authenticated using(public.is_operations());

-- Upgrade legacy published rows in one guarded update before revision pointers
-- are written. The completeness trigger remains active and validates the row.
update public.trips set content=content||jsonb_build_object(
  'description',case when length(trim(coalesce(content->>'description','')))>=20 then content->>'description' else coalesce(nullif(content->>'summary',''),title)||'。行程由运营按当天交通、天气及景点开放情况执行，出发前会提供集合信息与注意事项。' end,
  'itinerary',case when jsonb_typeof(content->'itinerary')='array' and jsonb_array_length(content->'itinerary')>0 then content->'itinerary' else jsonb_build_array(jsonb_build_object('name',coalesce(content->>'shortTitle',title),'description','按已发布行程游览，具体顺序以当天运营通知为准。')) end,
  'included',case when jsonb_typeof(content->'included')='array' and jsonb_array_length(content->'included')>0 then content->'included' else jsonb_build_array('往返车辆与司导服务') end,
  'excluded',case when jsonb_typeof(content->'excluded')='array' then content->'excluded' else jsonb_build_array('餐饮及个人消费') end,
  'childPolicy',case when length(trim(coalesce(content->>'childPolicy','')))>=10 then content->>'childPolicy' else '儿童价格与座位规则以所选班次和结账页显示为准。' end,
  'luggagePolicy',case when length(trim(coalesce(content->>'luggagePolicy','')))>=10 then content->>'luggagePolicy' else '大件行李须在下单前联系运营确认是否可以装载。' end,
  'accessibilityInfo',case when length(trim(coalesce(content->>'accessibilityInfo','')))>=10 then content->>'accessibilityInfo' else '路线可能包含台阶和坡道，需要无障碍协助时请提前确认。' end,
  'mealInfo',case when length(trim(coalesce(content->>'mealInfo','')))>=10 then content->>'mealInfo' else '餐食默认不包含，用餐安排以当天运营通知为准。' end,
  'weatherPolicy',case when length(trim(coalesce(content->>'weatherPolicy','')))>=10 then content->>'weatherPolicy' else '天气或道路异常时会评估替代安排并通知游客。' end,
  'cancellationPolicyVersion',case when length(trim(coalesce(content->>'cancellationPolicyVersion','')))>=3 then content->>'cancellationPolicyVersion' else '2026-09-v1' end
) where status='published' and not public.route_catalog_complete(content);

insert into public.product_revisions(trip_id,revision_number,state,title,content,hero_image_url,gallery,published_at)
select t.id,1,'published',t.title,t.content,t.hero_image_url,t.gallery,now()
from public.trips t where t.status='published' and not exists(select 1 from public.product_revisions r where r.trip_id=t.id)
on conflict(trip_id,revision_number) do nothing;
update public.trips t set current_published_revision_id=r.id
from public.product_revisions r where r.trip_id=t.id and r.state='published' and t.current_published_revision_id is null;

create or replace function public.list_public_product_catalog()
returns table(id uuid,slug text,title text,content jsonb,hero_image_url text,gallery jsonb,revision_number integer,updated_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select t.id,t.slug,r.title,r.content,r.hero_image_url,r.gallery,r.revision_number,coalesce(r.published_at,r.created_at)
  from public.trips t join public.product_revisions r on r.id=t.current_published_revision_id
  where t.status='published' and r.state='published'
  order by t.slug
$$;

create or replace function public.get_operations_products()
returns table(id uuid,slug text,status text,catalog_version integer,published_revision integer,draft_revision integer,title text,content jsonb,hero_image_url text,gallery jsonb,updated_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select t.id,t.slug,t.status,t.catalog_version,pub.revision_number,draft.revision_number,
    coalesce(draft.title,pub.title,t.title),coalesce(draft.content,pub.content,t.content),coalesce(draft.hero_image_url,pub.hero_image_url,t.hero_image_url),coalesce(draft.gallery,pub.gallery,t.gallery),t.updated_at
  from public.trips t left join public.product_revisions pub on pub.id=t.current_published_revision_id left join public.product_revisions draft on draft.id=t.current_draft_revision_id
  where public.is_operations() order by t.updated_at desc,t.slug
$$;

create or replace function public.operations_save_product_draft(p_trip uuid,p_expected_catalog_version integer,p_title text,p_content jsonb,p_hero_image_url text,p_gallery jsonb)
returns table(revision_id uuid,revision_number integer,new_catalog_version integer)
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.trips%rowtype;base public.product_revisions%rowtype;next_revision integer;created_id uuid;
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  select * into item from public.trips where id=p_trip for update;
  if not found then raise exception 'product not found'; end if;
  if item.catalog_version<>p_expected_catalog_version then raise exception 'product version conflict'; end if;
  select * into base from public.product_revisions where id=coalesce(item.current_draft_revision_id,item.current_published_revision_id);
  select coalesce(max(r.revision_number),0)+1 into next_revision from public.product_revisions r where r.trip_id=item.id;
  insert into public.product_revisions(trip_id,revision_number,state,title,content,hero_image_url,gallery,created_by)
  values(item.id,next_revision,'draft',coalesce(nullif(trim(p_title),''),base.title,item.title),coalesce(base.content,item.content,'{}'::jsonb)||coalesce(p_content,'{}'::jsonb),case when p_hero_image_url is null then coalesce(base.hero_image_url,item.hero_image_url) else nullif(trim(p_hero_image_url),'') end,case when p_gallery is null then coalesce(base.gallery,item.gallery,'[]'::jsonb) else p_gallery end,auth.uid()) returning id into created_id;
  update public.product_revisions set state='superseded' where id=item.current_draft_revision_id and state='draft';
  update public.trips set current_draft_revision_id=created_id,catalog_version=catalog_version+1,updated_at=now() where id=item.id;
  insert into public.account_audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'product_draft_saved','trip',item.id,jsonb_build_object('revision',next_revision));
  return query select created_id,next_revision,item.catalog_version+1;
end$$;

create or replace function public.operations_publish_product(p_trip uuid,p_expected_catalog_version integer)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.trips%rowtype;draft public.product_revisions%rowtype;
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  select * into item from public.trips where id=p_trip for update;
  if not found or item.catalog_version<>p_expected_catalog_version then raise exception 'product version conflict'; end if;
  select * into draft from public.product_revisions where id=item.current_draft_revision_id and state='draft' for update;
  if not found then raise exception 'draft not found'; end if;
  if length(trim(draft.title))<3 or jsonb_typeof(draft.gallery)<>'array' then raise exception 'draft incomplete'; end if;
  update public.product_revisions set state='superseded' where id=item.current_published_revision_id and state='published';
  update public.product_revisions set state='published',published_at=now() where id=draft.id;
  update public.trips set title=draft.title,content=draft.content,hero_image_url=draft.hero_image_url,gallery=draft.gallery,status='published',current_published_revision_id=draft.id,current_draft_revision_id=null,catalog_version=catalog_version+1,updated_at=now() where id=item.id;
  insert into public.account_audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'product_published','trip',item.id,jsonb_build_object('revision',draft.revision_number));
  return item.catalog_version+1;
end$$;

revoke all on function public.list_public_product_catalog(),public.get_operations_products(),public.operations_save_product_draft(uuid,integer,text,jsonb,text,jsonb),public.operations_publish_product(uuid,integer) from public,anon;
grant execute on function public.list_public_product_catalog() to anon,authenticated,service_role;
grant execute on function public.get_operations_products(),public.operations_save_product_draft(uuid,integer,text,jsonb,text,jsonb),public.operations_publish_product(uuid,integer) to authenticated,service_role;

commit;
