begin;

create or replace function public.operations_copy_product_versioned(
  p_source uuid,
  p_expected_catalog_version integer,
  p_slug text,
  p_title text
) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_source public.trips%rowtype;
  v_revision public.product_revisions%rowtype;
  v_new_product uuid;
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  select * into v_source from public.trips where id=p_source for update;
  if not found then raise exception 'source product not found'; end if;
  if v_source.catalog_version<>p_expected_catalog_version then raise exception 'product version conflict'; end if;
  select * into v_revision from public.product_revisions
    where id=coalesce(v_source.current_draft_revision_id,v_source.current_published_revision_id);
  v_new_product:=public.operations_create_product(
    p_slug,p_title,coalesce(v_revision.content,v_source.content),
    coalesce(v_revision.hero_image_url,v_source.hero_image_url),
    coalesce(v_revision.gallery,v_source.gallery)
  );
  insert into public.account_audit_events(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'product_copied','trip',v_new_product,jsonb_build_object(
    'sourceProductId',p_source,'sourceCatalogVersion',p_expected_catalog_version
  ));
  return v_new_product;
end$$;

revoke all on function public.operations_copy_product_versioned(uuid,integer,text,text) from public,anon;
grant execute on function public.operations_copy_product_versioned(uuid,integer,text,text) to authenticated,service_role;

commit;
