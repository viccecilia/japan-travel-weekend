begin;

create or replace function public.operations_create_product(
  p_slug text,p_title text,p_content jsonb,p_hero_image_url text,p_gallery jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_trip uuid;v_revision uuid;
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  if trim(coalesce(p_slug,'')) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(trim(coalesce(p_title,'')))<3 then raise exception 'invalid product identity'; end if;
  if jsonb_typeof(coalesce(p_gallery,'[]'::jsonb))<>'array' then raise exception 'gallery must be an array'; end if;
  insert into public.trips(slug,title,status,content,hero_image_url,gallery,catalog_version)
  values(lower(trim(p_slug)),trim(p_title),'draft',coalesce(p_content,'{}'::jsonb),nullif(trim(coalesce(p_hero_image_url,'')),''),coalesce(p_gallery,'[]'::jsonb),1)
  returning id into v_trip;
  insert into public.product_revisions(trip_id,revision_number,state,title,content,hero_image_url,gallery,created_by)
  values(v_trip,1,'draft',trim(p_title),coalesce(p_content,'{}'::jsonb),nullif(trim(coalesce(p_hero_image_url,'')),''),coalesce(p_gallery,'[]'::jsonb),auth.uid()) returning id into v_revision;
  update public.trips set current_draft_revision_id=v_revision where id=v_trip;
  insert into public.account_audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'product_created','trip',v_trip,jsonb_build_object('slug',lower(trim(p_slug))));
  return v_trip;
end$$;

create or replace function public.operations_copy_product(p_source uuid,p_slug text,p_title text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_source public.trips%rowtype;v_revision public.product_revisions%rowtype;
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  select * into v_source from public.trips where id=p_source;
  if not found then raise exception 'source product not found'; end if;
  select * into v_revision from public.product_revisions where id=coalesce(v_source.current_draft_revision_id,v_source.current_published_revision_id);
  return public.operations_create_product(p_slug,p_title,coalesce(v_revision.content,v_source.content),coalesce(v_revision.hero_image_url,v_source.hero_image_url),coalesce(v_revision.gallery,v_source.gallery));
end$$;

create or replace function public.operations_set_product_status(p_trip uuid,p_expected_catalog_version integer,p_action text,p_restore_revision integer default null)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_trip public.trips%rowtype;v_revision public.product_revisions%rowtype;v_new_id uuid;v_next integer;
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  select * into v_trip from public.trips where id=p_trip for update;
  if not found or v_trip.catalog_version<>p_expected_catalog_version then raise exception 'product version conflict'; end if;
  if p_action='archive' then
    update public.trips set status='archived',catalog_version=catalog_version+1,updated_at=now() where id=p_trip;
  elsif p_action='restore' then
    select * into v_revision from public.product_revisions where trip_id=p_trip and revision_number=p_restore_revision;
    if not found then raise exception 'revision not found'; end if;
    select coalesce(max(revision_number),0)+1 into v_next from public.product_revisions where trip_id=p_trip;
    insert into public.product_revisions(trip_id,revision_number,state,title,content,hero_image_url,gallery,created_by)
    values(p_trip,v_next,'draft',v_revision.title,v_revision.content,v_revision.hero_image_url,v_revision.gallery,auth.uid()) returning id into v_new_id;
    update public.product_revisions set state='superseded' where id=v_trip.current_draft_revision_id and state='draft';
    update public.trips set status=case when current_published_revision_id is null then 'draft' else status end,current_draft_revision_id=v_new_id,catalog_version=catalog_version+1,updated_at=now() where id=p_trip;
  else raise exception 'invalid product action'; end if;
  insert into public.account_audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'product_'||p_action,'trip',p_trip,jsonb_build_object('restoreRevision',p_restore_revision));
  return v_trip.catalog_version+1;
end$$;

create or replace function public.get_operations_product_revisions(p_trip uuid)
returns table(revision_number integer,state text,title text,created_at timestamptz,published_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select r.revision_number,r.state,r.title,r.created_at,r.published_at from public.product_revisions r
  where r.trip_id=p_trip and public.is_operations() order by r.revision_number desc
$$;

revoke all on function public.operations_create_product(text,text,jsonb,text,jsonb),public.operations_copy_product(uuid,text,text),public.operations_set_product_status(uuid,integer,text,integer),public.get_operations_product_revisions(uuid) from public,anon;
grant execute on function public.operations_create_product(text,text,jsonb,text,jsonb),public.operations_copy_product(uuid,text,text),public.operations_set_product_status(uuid,integer,text,integer),public.get_operations_product_revisions(uuid) to authenticated,service_role;

commit;
