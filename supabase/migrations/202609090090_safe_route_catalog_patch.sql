begin;

alter table public.trips add column if not exists catalog_version integer not null default 1 check(catalog_version>0);

create or replace function public.operations_patch_route_catalog(p_slug text,p_expected_version integer,p_patch jsonb)
returns table(trip_id uuid,new_version integer)
language plpgsql security definer set search_path=public,pg_temp as $$
declare current_trip public.trips%rowtype;next_content jsonb;next_gallery jsonb;
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  if length(trim(coalesce(p_slug,'')))<3 or p_expected_version<1 or p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb then raise exception 'invalid route patch'; end if;
  select * into current_trip from public.trips where slug=trim(p_slug) for update;
  if not found then raise exception 'route not found'; end if;
  if current_trip.catalog_version<>p_expected_version then raise exception 'route version conflict'; end if;
  if p_patch ? 'status' and p_patch->>'status' not in ('draft','published','archived') then raise exception 'invalid route status'; end if;
  if p_patch ? 'title' and length(trim(coalesce(p_patch->>'title','')))<3 then raise exception 'invalid route title'; end if;
  if p_patch ? 'gallery' and jsonb_typeof(p_patch->'gallery')<>'array' then raise exception 'invalid route gallery'; end if;
  next_content:=current_trip.content||coalesce(p_patch->'content','{}'::jsonb);
  next_gallery:=case when p_patch ? 'gallery' then p_patch->'gallery' else current_trip.gallery end;
  update public.trips set
    title=case when p_patch ? 'title' then trim(p_patch->>'title') else current_trip.title end,
    status=case when p_patch ? 'status' then p_patch->>'status' else current_trip.status end,
    content=next_content,
    hero_image_url=case when p_patch ? 'heroImageUrl' then nullif(trim(coalesce(p_patch->>'heroImageUrl','')),'') else current_trip.hero_image_url end,
    gallery=next_gallery,
    catalog_version=current_trip.catalog_version+1,
    updated_at=now()
  where id=current_trip.id;
  insert into public.account_audit_events(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'route_catalog_patched','trip',current_trip.id,jsonb_build_object('slug',current_trip.slug,'fromVersion',current_trip.catalog_version,'changedFields',(select jsonb_agg(key) from jsonb_object_keys(p_patch) key)));
  return query select current_trip.id,current_trip.catalog_version+1;
end$$;

revoke all on function public.operations_patch_route_catalog(text,integer,jsonb) from public,anon;
grant execute on function public.operations_patch_route_catalog(text,integer,jsonb) to authenticated,service_role;

commit;
