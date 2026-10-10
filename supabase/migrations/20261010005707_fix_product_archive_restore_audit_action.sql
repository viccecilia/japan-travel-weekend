begin;

create or replace function public.operations_set_product_status(
  p_trip uuid,
  p_expected_catalog_version integer,
  p_action text,
  p_restore_revision integer default null
)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_trip public.trips%rowtype;
  v_revision public.product_revisions%rowtype;
  v_new_id uuid;
  v_next integer;
  v_audit_action text;
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  select * into v_trip from public.trips where id=p_trip for update;
  if not found or v_trip.catalog_version<>p_expected_catalog_version then raise exception 'product version conflict'; end if;
  if p_action='archive' then
    v_audit_action:='product_archived';
    update public.trips set status='archived',catalog_version=catalog_version+1,updated_at=now() where id=p_trip;
  elsif p_action='restore' then
    v_audit_action:='product_restored';
    select * into v_revision from public.product_revisions where trip_id=p_trip and revision_number=p_restore_revision;
    if not found then raise exception 'revision not found'; end if;
    select coalesce(max(revision_number),0)+1 into v_next from public.product_revisions where trip_id=p_trip;
    insert into public.product_revisions(trip_id,revision_number,state,title,content,hero_image_url,gallery,created_by)
    values(p_trip,v_next,'draft',v_revision.title,v_revision.content,v_revision.hero_image_url,v_revision.gallery,auth.uid()) returning id into v_new_id;
    update public.product_revisions set state='superseded' where id=v_trip.current_draft_revision_id and state='draft';
    update public.trips set status=case when current_published_revision_id is null then 'draft' else status end,current_draft_revision_id=v_new_id,catalog_version=catalog_version+1,updated_at=now() where id=p_trip;
  else raise exception 'invalid product action'; end if;
  insert into public.account_audit_events(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),v_audit_action,'trip',p_trip,jsonb_build_object('restoreRevision',p_restore_revision));
  return v_trip.catalog_version+1;
end$$;

commit;
