-- Keep the Discover translation sidecar written by the batch importer while
-- retaining the original Operations-only, optimistic-locking save boundary.
create or replace function public.save_discover_hero(p_id uuid,p_expected_version integer,p_content jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 previous public.discover_heroes;
 saved public.discover_heroes;
 lang record;
 metadata jsonb;
 metadata_field record;
 product uuid;
 result jsonb;
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
   if exists(select 1 from jsonb_object_keys(lang.value) k where k not in('title','subtitle','highlight_phrase','_content_package')) then raise exception 'unsupported translation field'; end if;
   if jsonb_typeof(lang.value->'title') is distinct from 'string' or jsonb_typeof(lang.value->'subtitle') is distinct from 'string'
     or length(lang.value->>'title')>240 or length(lang.value->>'subtitle')>500 then raise exception 'invalid translation text'; end if;
   if lang.value ? 'highlight_phrase' and (jsonb_typeof(lang.value->'highlight_phrase') is distinct from 'string' or length(lang.value->>'highlight_phrase')>240) then raise exception 'invalid translation highlight'; end if;

   if lang.value ? '_content_package' then
     metadata:=lang.value->'_content_package';
     if jsonb_typeof(metadata) is distinct from 'object' then raise exception 'invalid translation metadata'; end if;
     if exists(select 1 from jsonb_object_keys(metadata) k where k not in('source_hash','status','fields')) then raise exception 'unsupported translation metadata field'; end if;
     if metadata ? 'source_hash' and (jsonb_typeof(metadata->'source_hash') is distinct from 'string' or (metadata->>'source_hash') !~ '^fnv1a-[0-9a-f]+$') then raise exception 'invalid translation source hash'; end if;
     if metadata ? 'status' and (jsonb_typeof(metadata->'status') is distinct from 'string' or metadata->>'status' not in('missing','draft','reviewed','published','stale')) then raise exception 'invalid translation status'; end if;
     if metadata ? 'fields' then
       if jsonb_typeof(metadata->'fields') is distinct from 'object' then raise exception 'invalid translation metadata fields'; end if;
       for metadata_field in select key,value from jsonb_each(metadata->'fields') loop
         if metadata_field.key not in('title','subtitle','highlight_phrase') then raise exception 'unsupported translation metadata field key'; end if;
         if jsonb_typeof(metadata_field.value) is distinct from 'object'
           or exists(select 1 from jsonb_object_keys(metadata_field.value) k where k not in('source_hash','status'))
           or jsonb_typeof(metadata_field.value->'source_hash') is distinct from 'string'
           or (metadata_field.value->>'source_hash') !~ '^fnv1a-[0-9a-f]+$'
           or jsonb_typeof(metadata_field.value->'status') is distinct from 'string'
           or metadata_field.value->>'status' not in('missing','draft','reviewed','published','stale')
         then raise exception 'invalid translation field metadata'; end if;
       end loop;
     end if;
   end if;
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
